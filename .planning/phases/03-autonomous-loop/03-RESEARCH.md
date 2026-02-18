# Phase 3: Autonomous Loop - Research

**Researched:** 2026-02-18
**Domain:** Agentic LLM loop, tool-calling protocol, multi-agent orchestration, BullMQ job lifecycle, crash-recovery journaling
**Confidence:** HIGH (stack verified against installed library types, official docs, Anthropic engineering blog)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Goal-setting behavior
- Goals come from both operator injection and agent self-discovery
- When a goal is discovered or injected, a new independent main agent is spawned for it
- Multiple main agents run concurrently, independently, without communicating unless required
- Decomposition depth is Claude's discretion — the agent has sub-agent spawning as a tool and decides how granular to go based on the situation
- Priority between competing goals is agent-determined — the agent develops and tunes its own heuristic based on outcomes

#### Replanning & divergence
- Dual detection: metric-based triggers for obvious failures (cost exceeded, retry exhaustion, criteria not met) + LLM evaluation for subtler divergence (outcome quality, unexpected results)
- Operator notified only on major replans (top-level goal changes or abandonment). Routine sub-goal replanning is logged but silent
- When replanning triggers, the agent evaluates whether in-progress work is still useful under the new plan — keeps what's relevant, aborts what's not
- Hard replan limit per goal, then escalate to operator. Goal is paused (not abandoned) pending operator decision

#### Sub-agent orchestration
- Sub-agents receive scoped context — only what's relevant to their task. No visibility into parent's full state or sibling agents' work
- Per-main-agent concurrency cap on sub-agents. If the cap is reached, the main agent waits for a slot to open before spawning more
- Parent agent periodically checks in on sub-agent progress. If stuck, parent can intervene, re-scope, or kill the sub-agent
- All agents draw from a shared cost pool — no per-agent budget isolation

#### Recovery & checkpointing
- Checkpoints at every sub-goal completion. If crash happens mid-sub-goal, replay from last completed sub-goal
- On crash recovery: Discord DM alert + dashboard indicator showing which agents restarted and what was affected
- Partially completed sub-goals are re-evaluated on recovery — agent checks if work is still valid, then resumes, retries, or replans
- Multiple main agents restart in staggered sequence (not all at once) managed by a supervisor to avoid resource spikes

### Claude's Discretion
- Goal decomposition depth and strategy per situation
- Priority heuristic design and evolution
- In-progress work evaluation criteria during replanning
- Sub-agent check-in frequency and intervention thresholds
- Specific checkpoint data structure and journal format
- Staggered restart timing and ordering logic

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| LOOP-01 | Agent sets high-level goals and decomposes them into sub-goals with dependencies | OpenAI-compatible tool calling API via openai SDK v4.104; structured JSON decomposition response via `response_format: {type: 'json_schema'}` |
| LOOP-02 | Agent executes sub-goals by invoking tools and recording outcomes | Existing `invokeWithKillCheck` + `invokeWithLogging` pipeline; tool results fed back as `role: 'tool'` messages in OpenAI message format |
| LOOP-03 | Agent evaluates outcomes against expectations and triggers replanning when divergent | LLM evaluation pass using cheap tier; metric-based triggers checked before LLM evaluation call |
| LOOP-04 | Agent runs continuous planning cycles without human intervention | setInterval / recursive async loop with cycle logged via existing `logCycleStart`/`logCycleComplete` |
| LOOP-05 | Agent prioritizes sub-goals based on expected value and current capabilities | Agent-managed priority field in sub-goal data structure; LLM assigns priority at decomposition time |
| MULTI-01 | Main agent can spawn sub-agents to handle specific tasks concurrently | Sub-agent = new BullMQ job on `agent-tasks` queue; result returned via job return value |
| MULTI-02 | Sub-agents have isolated LLM context focused on their assigned task | Each BullMQ job starts a fresh message array; no shared context object |
| MULTI-03 | Sub-agents report structured results back to the main agent on completion or failure | BullMQ job return value (JSON-serialized); main agent calls `queue.getJobState`/`job.returnvalue` |
| MULTI-04 | Main agent can monitor sub-agent status and cancel running sub-agents | `worker.cancelJob(jobId)` (BullMQ v5 API); `queue.getJob(id)` for status polling |
| MULTI-05 | Sub-agents share the same tool layer and database but have independent LLM sessions | Workers share `@jarvis/tools` registry and `@jarvis/db` pool; each job creates its own message array |
| MULTI-06 | Main agent decides when to spawn a sub-agent vs execute inline based on task complexity | LLM decision in planning prompt; "spawn-agent" exposed as a first-class tool |
| QUEUE-01 | External calls retry with exponential backoff on transient failures | BullMQ `attempts` + `backoff: {type: 'exponential', delay: 1000}` on job options |
| QUEUE-02 | Exhausted retries move tasks to dead-letter queue for operator review | BullMQ failed set is the DLQ; `removeOnFail: false` preserves them; operator queries via `queue.getFailed()` |
| QUEUE-03 | Task context is fully preserved across retries for deterministic replay | Job `data` payload is immutable in BullMQ Redis; retry gets same data each attempt |
| QUEUE-04 | Scheduled and recurring tasks can be enqueued with cron-like timing | `queue.upsertJobScheduler(id, {pattern: 'cron-expr'})` — new BullMQ v5 API replacing deprecated `repeat` |
| QUEUE-05 | Long-running tasks (browser automation, web research) execute asynchronously | Existing BullMQ worker architecture; main agent enqueues, polls or awaits completion event |
| RECOV-01 | Agent journals each task step result before proceeding to the next step | Append to `agent_state` table (key = `journal:<goalId>`) after each sub-goal completes |
| RECOV-02 | On restart, agent replays journal to resume from last checkpoint | On startup, read journal from `agent_state`; skip already-completed sub-goal IDs |
| RECOV-03 | Agent survives Fly.io machine restarts without losing in-flight work | Fly.io `restart: always` policy + Postgres-backed journal; Redis-backed BullMQ jobs survive via persistence |
| RECOV-04 | Incomplete planning cycles are detected and replanned on recovery | Query `planning_cycles` for `status='active'` rows on startup; treat as interrupted cycles |
</phase_requirements>

---

## Summary

Phase 3 wires the agent's AI reasoning layer (Phase 2) to its tool execution layer (Phase 1) into a continuous autonomous loop. The central mechanism is a tool-calling agentic loop: the main agent sends a message array to the LLM, receives either a text response or one or more `tool_calls`, executes the requested tools via the existing `invokeWithKillCheck` pipeline, appends results as `role: 'tool'` messages, and repeats until the model produces a final text response with `finish_reason: 'stop'`. This is the standard OpenAI-compatible tool-use protocol, fully supported by OpenRouter and the installed `openai` SDK v4.104.

Multi-agent execution is implemented by treating "spawn a sub-agent" as just another tool. When the main agent calls `spawn-agent`, a new BullMQ job is enqueued on the `agent-tasks` queue, each job running its own isolated agentic loop with a fresh message array. The main agent can poll or await sub-agent job completion, read the structured result from `job.returnvalue`, and continue planning. BullMQ's per-queue global concurrency (`setGlobalConcurrency`) enforces the per-main-agent sub-agent cap. The existing worker infrastructure handles actual execution.

Crash recovery uses an append-only journal in Postgres (`agent_state` table, key namespaced per goal). After every sub-goal completes, the agent writes a checkpoint record. On startup, it queries for active `planning_cycles` rows, reads the journal, and resumes from the last completed sub-goal — skipping everything already journaled. Fly.io's `restart: always` policy ensures the process is automatically relaunched. Discord DM alerts on recovery use the existing `sendOperatorDm` infrastructure from Phase 2.

**Primary recommendation:** Build in this order: (1) tool-calling protocol extension to `@jarvis/ai` `ModelRouter`, (2) agent core loop in `apps/agent`, (3) sub-agent spawning tool, (4) BullMQ retry/DLQ/scheduler configuration, (5) journal/recovery system. Each layer builds directly on prior infrastructure with no new dependencies.

---

## Standard Stack

### Core (all already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| openai | 4.104.0 | Tool-calling protocol via OpenRouter | `ChatCompletionTool`, `ChatCompletionMessageToolCall`, `finish_reason: 'tool_calls'` all present in installed types |
| bullmq | 5.69.3 | Job queue, retry/backoff, scheduler, DLQ | Already in use; `upsertJobScheduler`, `setGlobalConcurrency`, `cancelJob`, `UnrecoverableError` all available |
| drizzle-orm | 0.40.x | Journal persistence in agent_state table | Already the DB layer; JSONB columns handle arbitrary checkpoint payloads |
| @jarvis/ai | workspace | Model router + kill switch | Already wired; needs tool-calling extension |
| @jarvis/tools | workspace | Tool registry + invokeWithKillCheck | Already wired; spawn-agent becomes a new tool registration |
| @jarvis/logging | workspace | logCycleStart/Complete, logDecision | Already wired; used throughout the loop |

### No New Dependencies Needed
The full Phase 3 stack is satisfied by what is already installed. The only additions are:
- Schema migrations (new tables/columns in `@jarvis/db`)
- New source files in `apps/agent/src/` and `@jarvis/ai/src/`

---

## Architecture Patterns

### Recommended Project Structure

```
apps/agent/src/
├── index.ts                    # Startup (Phase 2, extended with loop bootstrap)
├── worker.ts                   # BullMQ tool worker (Phase 2, add agent-tasks queue)
├── loop/
│   ├── agent-loop.ts           # Core agentic loop (tool-calling cycle)
│   ├── goal-manager.ts         # Goal lifecycle: set, decompose, track, complete
│   ├── planner.ts              # LLM planning prompts, sub-goal decomposition
│   ├── evaluator.ts            # Outcome evaluation: metric checks + LLM divergence
│   └── replanner.ts            # Replan logic: keep/abort in-progress work
├── multi-agent/
│   ├── supervisor.ts           # Spawns/monitors main agent instances
│   ├── sub-agent-tool.ts       # "spawn-agent" tool definition
│   └── result-collector.ts     # Polls/awaits sub-agent job completion
├── recovery/
│   ├── journal.ts              # Checkpoint write/read via agent_state
│   └── startup-recovery.ts     # On-boot replay logic
├── memory-consolidation.ts     # (Phase 1, unchanged)
└── shutdown.ts                 # (Phase 1, unchanged)

packages/ai/src/
├── router.ts                   # Extended with tool-calling support
├── tool-call-executor.ts       # Tool call dispatch: LLM response → tool invoke
└── ...existing files...

packages/db/src/schema/
├── goals.ts                    # NEW: goal lifecycle table
├── sub-goals.ts                # NEW: sub-goal decomposition + dependency tracking
└── ...existing files...
```

### Pattern 1: OpenAI Tool-Calling Agentic Loop

**What:** The agent sends a messages array to the LLM. If `finish_reason === 'tool_calls'`, it executes each requested tool, appends results as `role: 'tool'` messages, and calls the LLM again. Repeats until `finish_reason === 'stop'`.

**When to use:** Every planning step where the agent needs to take actions in the world.

**The protocol (verified against installed openai SDK v4.104 types):**

```typescript
// Source: openai SDK v4.104 types + OpenRouter tool-calling docs
// https://openrouter.ai/docs/guides/features/tool-calling

import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';

const tools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'shell',
      description: 'Execute a shell command on the host',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command'],
      },
    },
  },
  // ... other tools from registry
];

async function agentLoop(
  messages: ChatCompletionMessageParam[],
  maxTurns = 20
): Promise<string> {
  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await openRouterClient.chat.completions.create({
      model: modelConfig.strong,
      messages,
      tools,
      tool_choice: 'auto',
      stream: false,
    });

    const choice = response.choices[0];
    messages.push(choice.message); // append assistant message (required)

    if (choice.finish_reason === 'stop') {
      return choice.message.content ?? '';
    }

    if (choice.finish_reason === 'tool_calls') {
      for (const toolCall of choice.message.tool_calls ?? []) {
        const input = JSON.parse(toolCall.function.arguments);
        const result = await invokeWithKillCheck(
          killSwitch, registry, db,
          toolCall.function.name, input
        );
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
    }
  }
  throw new Error(`Agent loop exceeded ${maxTurns} turns`);
}
```

**Critical:** The assistant message (with `tool_calls`) MUST be appended to the messages array BEFORE the tool result messages. Skipping this causes a malformed message array and OpenRouter will reject it.

### Pattern 2: Sub-Agent as a First-Class Tool

**What:** `spawn-agent` is a registered ToolDefinition. When the LLM calls it, the tool implementation enqueues a BullMQ job and returns a `jobId`. The parent agent can later call `await-agent` with that `jobId` to get the result.

**When to use:** Whenever the LLM decides a task is complex enough or parallelizable enough to delegate.

```typescript
// Source: BullMQ v5.69.3 types (verified in node_modules)
// apps/agent/src/multi-agent/sub-agent-tool.ts

import { Queue } from 'bullmq';
import type { ToolDefinition } from '@jarvis/tools';
import { z } from 'zod';

export function createSpawnAgentTool(queue: Queue): ToolDefinition {
  return {
    name: 'spawn-agent',
    description: 'Spawn a focused sub-agent to execute a scoped task concurrently. Returns jobId.',
    inputSchema: z.object({
      task: z.string().describe('Clear task description with objectives and expected output format'),
      context: z.record(z.unknown()).describe('Scoped context the sub-agent needs — only what is relevant'),
    }),
    timeoutMs: 5_000, // just the enqueue; sub-agent runtime is separate
    async execute({ task, context }) {
      const job = await queue.add('sub-agent', { task, context });
      return { jobId: job.id };
    },
  };
}

export function createAwaitAgentTool(queue: Queue): ToolDefinition {
  return {
    name: 'await-agent',
    description: 'Wait for a spawned sub-agent to complete and return its structured result.',
    inputSchema: z.object({ jobId: z.string() }),
    timeoutMs: 300_000, // 5 min max wait
    async execute({ jobId }, signal) {
      // Poll with abort signal support
      while (!signal.aborted) {
        const job = await queue.getJob(jobId);
        if (!job) throw new Error(`Sub-agent job ${jobId} not found`);
        const state = await job.getState();
        if (state === 'completed') return job.returnvalue;
        if (state === 'failed') throw new Error(`Sub-agent failed: ${job.failedReason}`);
        await new Promise(r => setTimeout(r, 2000));
      }
      throw new Error('await-agent aborted');
    },
  };
}
```

### Pattern 3: Checkpoint Journal via agent_state

**What:** After each sub-goal completes, the agent upserts a journal entry into `agent_state`. Key format: `journal:<goalId>`. Value: array of completed sub-goal records. On startup, the agent reads this to know where to resume.

**When to use:** At every sub-goal boundary (RECOV-01).

```typescript
// Source: existing agent_state schema in @jarvis/db
// packages/db/src/schema/agent-state.ts (key-value JSONB store)

interface JournalEntry {
  subGoalId: string;
  completedAt: string;      // ISO timestamp
  outcome: unknown;          // what was produced
  valid: boolean;            // still valid under current plan?
}

// Write checkpoint after sub-goal completes
async function checkpoint(db: DbClient, goalId: string, entry: JournalEntry) {
  const key = `journal:${goalId}`;
  const existing = await db.select().from(agentState).where(eq(agentState.key, key)).limit(1);
  const entries: JournalEntry[] = (existing[0]?.value as JournalEntry[] | undefined) ?? [];
  entries.push(entry);

  if (existing.length > 0) {
    await db.update(agentState)
      .set({ value: entries, updatedAt: new Date() })
      .where(eq(agentState.key, key));
  } else {
    await db.insert(agentState).values({ key, value: entries });
  }
}

// On startup: find active cycles and resume
async function recoverGoals(db: DbClient) {
  // RECOV-04: Find incomplete planning cycles
  const activeCycles = await db.select().from(planningCycles)
    .where(eq(planningCycles.status, 'active'));

  for (const cycle of activeCycles) {
    const journal = await readJournal(db, cycle.id.toString());
    const completedIds = new Set(journal.map(e => e.subGoalId));
    // Re-queue goal with completedIds known; loop skips already-done sub-goals
    await spawnMainAgent({ cycle, completedIds });
  }
}
```

### Pattern 4: BullMQ Retry with Exponential Backoff + Dead-Letter Queue

**What:** Tool-execution jobs configure `attempts` and `backoff`. When all attempts are exhausted, BullMQ moves the job to the failed set (which IS the DLQ). `removeOnFail: false` preserves failed jobs indefinitely for operator inspection.

**When to use:** All external tool calls that may transiently fail (QUEUE-01, QUEUE-02).

```typescript
// Source: BullMQ v5.69.3 types (verified: BackoffOptions, BaseJobOptions)
// https://docs.bullmq.io/guide/retrying-failing-jobs

await queue.add('tool-execution', jobData, {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 1000,    // 1s, 2s, 4s, 8s, 16s
    jitter: 0.25,   // ±25% randomness to avoid thundering herd
  },
  removeOnComplete: { age: 3600 },
  removeOnFail: false,   // QUEUE-02: Preserve in DLQ (failed set)
});

// UnrecoverableError — skip retries immediately for non-transient failures
import { UnrecoverableError } from 'bullmq';
// In worker processor:
if (isNonTransientError(err)) {
  throw new UnrecoverableError(err.message);
}
```

**DLQ inspection:** Operator queries `await queue.getFailed(0, 100)` to see dead-lettered jobs. No separate queue needed — BullMQ's failed set IS the DLQ pattern.

### Pattern 5: Scheduled / Recurring Tasks via upsertJobScheduler

**What:** BullMQ v5's `upsertJobScheduler` (replaces deprecated `add(..., {repeat})`) creates idempotent cron-based job schedules stored in Redis.

**When to use:** Recurring tasks like market data polling, periodic health checks (QUEUE-04).

```typescript
// Source: BullMQ v5.69.3 Queue.d.ts (verified: upsertJobScheduler signature)
// https://docs.bullmq.io/guide/jobs/repeatable

// Creates or updates a job scheduler identified by 'daily-market-scan'
await queue.upsertJobScheduler(
  'daily-market-scan',              // unique scheduler ID
  { pattern: '0 6 * * *' },        // cron: every day at 6am
  {
    name: 'tool-execution',
    data: { toolName: 'http', input: { url: '...' } },
  }
);

// Fixed-interval example (every 30 seconds):
await queue.upsertJobScheduler(
  'health-check',
  { every: 30_000 },
  { name: 'tool-execution', data: { toolName: 'db', input: '...' } }
);
```

**Key property:** Job schedules survive worker restarts. The schedule metadata is stored in Redis and re-evaluated when the next job is due — no missed jobs pile up if workers were down.

### Pattern 6: Staggered Multi-Agent Restart Supervisor

**What:** On process startup, the supervisor reads all active goal IDs from Postgres and spawns main agent loops one at a time with a configurable delay between each.

**When to use:** Crash recovery with multiple concurrent main agents (locked decision).

```typescript
// apps/agent/src/multi-agent/supervisor.ts

async function staggeredRestart(db: DbClient, delayMs = 2000) {
  const activeGoals = await loadActiveGoals(db);

  for (const goal of activeGoals) {
    await spawnMainAgentLoop(goal);
    await new Promise(r => setTimeout(r, delayMs)); // stagger
  }
}
```

### Anti-Patterns to Avoid

- **Shared message array across agents:** Each agent loop (main and sub-agent) MUST have its own `messages: ChatCompletionMessageParam[]`. Sharing a messages array leaks context between agents, violating MULTI-02.
- **Not appending the assistant message before tool results:** OpenRouter rejects requests where `tool` role messages appear without a preceding `assistant` message containing `tool_calls`. This will cause every tool-calling turn to fail.
- **Polling BullMQ job state in a tight loop:** Use 1-2 second intervals minimum to avoid Redis load. For long-running sub-agents, the parent agent should itself yield to other work between polls.
- **Storing full conversation history in agent_state checkpoint:** Checkpoint should contain sub-goal outcomes only, not the full LLM context. Context is reconstructable from the checkpoint; duplicating it bloats the journal.
- **Using deprecated `queue.add(..., {repeat})` for scheduling:** BullMQ v5 deprecates this in favor of `upsertJobScheduler`. The old API still works but is going away in v6.
- **Forgetting `removeOnFail: false` for DLQ jobs:** BullMQ defaults to keeping failed jobs, but explicit setting makes intent clear and guards against future config changes.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Job retry with backoff | Custom retry loop with setTimeout | BullMQ `attempts` + `backoff: {type: 'exponential'}` | BullMQ handles stalled jobs, lock expiry, and concurrent workers correctly; custom retry misses these |
| Recurring/scheduled tasks | setInterval in Node process | BullMQ `upsertJobScheduler` | setInterval dies with the process; BullMQ schedules persist in Redis across restarts |
| Sub-agent result waiting | Custom Redis pub/sub or polling | BullMQ `job.getState()` + `job.returnvalue` | Already in the queue; no extra infrastructure needed |
| Tool JSON schema for LLM | Custom type generation | Zod `.parse()` + `zodToJsonSchema` (or manual schema mirror) | Tool inputSchemas are already Zod; converting to OpenAI JSON Schema format is straightforward |
| LLM structured output parsing | Regex / string manipulation | `response_format: {type: 'json_schema', ...}` on OpenRouter | Models supported: claude-sonnet-4.5, claude-opus-4.1, gpt-4o, gemini — covers all three tiers |
| Crash recovery state machine | Custom distributed lock + state | Postgres journal in `agent_state` + startup replay | agent_state already exists; JSONB handles arbitrary checkpoint payloads |

**Key insight:** BullMQ's failed set is already the dead-letter queue. No separate DLQ queue needed — just configure `removeOnFail: false` and expose operator tooling to read `queue.getFailed()`.

---

## Common Pitfalls

### Pitfall 1: Tool-Calling Message Array Corruption
**What goes wrong:** Agent sends a `role: 'tool'` message without a preceding assistant message containing `tool_calls`. OpenRouter returns a 400 error. Alternatively, the assistant message is forgotten when the messages array is serialized to Postgres and reloaded.
**Why it happens:** Developers omit the assistant turn-append step, or serialize only the user messages for context-window management.
**How to avoid:** Always push `choice.message` (the full assistant message object, including `tool_calls`) before pushing any tool result messages. Test this with a mock that validates message array structure.
**Warning signs:** OpenRouter returns "Invalid request: messages with role 'tool' must follow an assistant message with 'tool_calls'" errors.

### Pitfall 2: Sub-Agent Context Leakage
**What goes wrong:** The main agent passes its full `messages` array or `goals` object to sub-agents. Sub-agents gain visibility into unrelated work, increasing token cost and potentially causing interference.
**Why it happens:** Passing state objects by reference rather than extracting only the relevant slice.
**How to avoid:** Sub-agent job `data` payload must be constructed at spawn time with only the relevant `task` description and `context` object. Never pass the parent's message array.
**Warning signs:** Sub-agent token usage is unexpectedly high; sub-agents reference facts outside their stated task.

### Pitfall 3: Journal Write Failure Causing Replay Loops
**What goes wrong:** A sub-goal completes successfully but the Postgres journal write fails (e.g., transient DB error). On restart, the agent re-executes the already-completed sub-goal, causing duplicate work or side effects.
**Why it happens:** Treating journal write as best-effort rather than required.
**How to avoid:** Journal write must succeed before the agent proceeds to the next sub-goal. Use a retry loop on the checkpoint write. If the write fails after N retries, stop the agent and alert the operator rather than proceeding without a checkpoint.
**Warning signs:** Sub-goals execute multiple times; operations accumulate duplicates in external systems.

### Pitfall 4: Missing `finish_reason` Branch
**What goes wrong:** The agent loop only handles `tool_calls` and `stop`, ignoring `length` (context window exhausted) and `content_filter`. When the model hits the context limit, the loop hangs or crashes.
**Why it happens:** Happy-path implementation without exhaustive finish_reason handling.
**How to avoid:** Explicitly handle all `finish_reason` values: `'stop'` (done), `'tool_calls'` (execute tools), `'length'` (context limit — summarize and continue), `'content_filter'` (flag and escalate).
**Warning signs:** Loop hangs silently when processing long tasks; no error logged but no progress either.

### Pitfall 5: BullMQ Worker Concurrency vs. Global Concurrency Conflict
**What goes wrong:** Per-worker concurrency is set to 10, but global concurrency is set to 4. With 3 workers, only 4 jobs run at a time despite each worker having capacity. Operator expects 30 concurrent jobs, gets 4.
**Why it happens:** Misunderstanding that global concurrency is a hard ceiling, not a default.
**How to avoid:** Set global concurrency only if you need a hard cap across all workers. For per-main-agent sub-agent caps, implement at the application level (count active sub-agent jobs per goal before spawning) since free BullMQ has no per-group concurrency (that's BullMQ Pro).
**Warning signs:** Workers appear idle despite jobs in the queue; throughput is far below expected.

### Pitfall 6: Stalled Sub-Agent Detection
**What goes wrong:** A sub-agent BullMQ job is picked up by a worker but the worker process crashes. The job enters a stalled state and BullMQ eventually retries it — but the parent agent is still waiting on the original `jobId` and never polls the replacement job.
**Why it happens:** Parent agent polls by `jobId`, which changes on retry if the job is moved.
**How to avoid:** Parent agent should poll `job.getState()` and handle `'stalled'` as an expected transient state. If the job is requeued with a new ID (BullMQ moves stalled jobs back to waiting), use a deterministic `jobId` (based on goal+task hash) so the parent can find the re-queued job.
**Warning signs:** Parent agent times out waiting for a sub-agent that never completes; sub-agent status shows stalled.

### Pitfall 7: Spawning 50 Sub-Agents for Simple Goals
**What goes wrong:** LLM over-decomposes a simple goal into dozens of parallel sub-agents, each of which costs tokens to start up, manage, and aggregate. Anthropic's own research noted their early system spawned 50 subagents for simple queries.
**Why it happens:** The planning prompt doesn't establish a cost model for spawning decisions.
**How to avoid:** Planning prompt must explicitly instruct the LLM to weigh task complexity against overhead. Simple, fast tasks should execute inline. Sub-agent spawning should be reserved for tasks that are (a) parallelizable AND (b) complex enough to warrant isolated context.
**Warning signs:** Cost per goal is unexpectedly high; most sub-agents complete in under 10 seconds.

---

## Code Examples

### Tool-Calling Extension to ModelRouter

The existing `ModelRouter.complete()` method must be extended with a `tools` parameter and a new `completeWithTools()` method that returns the full choice object (not just the content string) so the caller can inspect `finish_reason` and `tool_calls`.

```typescript
// Source: openai SDK v4.104 types (ChatCompletionTool, ChatCompletionMessage)
// packages/ai/src/router.ts — new method alongside existing complete()

import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionMessage,
} from 'openai/resources/chat/completions';

async completeWithTools(
  messages: ChatCompletionMessageParam[],
  tier: Tier,
  tools: ChatCompletionTool[],
  context?: { goalId?: number },
): Promise<{ message: ChatCompletionMessage; finishReason: string }> {
  await this.killSwitch.assertActive();
  const modelId = this.config[tier];

  const response = await this.provider.completeWithTools({
    messages,
    model: modelId,
    tools,
  });

  // Log to ai_calls (same as existing complete())
  await this.db.insert(aiCalls).values({ ... });

  return { message: response.message, finishReason: response.finishReason };
}
```

### New DB Schema: Goals and Sub-Goals

Phase 3 requires new tables to track goal lifecycle and sub-goal decomposition. The existing `planning_cycles` and `agent_state` tables are not sufficient because they lack per-goal dependency tracking.

```typescript
// packages/db/src/schema/goals.ts (NEW)

import { integer, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

export const goals = pgTable('goals', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  // 'operator-injected' | 'agent-discovered'
  source: varchar('source', { length: 32 }).notNull(),
  description: text('description').notNull(),
  // 'active' | 'paused' | 'completed' | 'abandoned'
  status: varchar('status', { length: 32 }).notNull().default('active'),
  // Replan counter — escalate to operator when >= hard limit
  replanCount: integer('replan_count').notNull().default(0),
  priority: integer('priority').notNull().default(50), // 0=highest
  // Operator-visible pause reason when status='paused'
  pauseReason: text('pause_reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const subGoals = pgTable('sub_goals', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  goalId: integer('goal_id').references(() => goals.id).notNull(),
  description: text('description').notNull(),
  // JSONB: array of sub_goal IDs that must complete before this one
  dependsOn: jsonb('depends_on').notNull().default([]),
  // 'pending' | 'in-progress' | 'completed' | 'failed' | 'skipped'
  status: varchar('status', { length: 32 }).notNull().default('pending'),
  // JSONB: what the sub-goal produced
  outcome: jsonb('outcome'),
  // BullMQ job ID if delegated to a sub-agent
  agentJobId: varchar('agent_job_id', { length: 128 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});
```

### Operator Notification on Major Replan

```typescript
// Source: existing sendOperatorDm from @jarvis/ai/discord.ts

import { sendOperatorDm } from '@jarvis/ai';

async function notifyMajorReplan(
  goalId: number,
  reason: string,
  replanCount: number,
): Promise<void> {
  const msg = `[Jarvis] Goal #${goalId} replanned (attempt ${replanCount}): ${reason}`;
  await sendOperatorDm(
    process.env.DISCORD_BOT_TOKEN!,
    process.env.DISCORD_OPERATOR_USER_ID!,
    msg,
  );
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `queue.add(..., {repeat: {cron: '...'}})` | `queue.upsertJobScheduler(id, {pattern: '...'})` | BullMQ v5 | Old API deprecated, removed in v6; use upsertJobScheduler |
| `function_call` (deprecated) | `tool_calls` array | OpenAI API 2023+ | function_call in the installed types is marked `@deprecated`; use `tool_calls` exclusively |
| Separate DLQ queue | BullMQ failed set with `removeOnFail: false` | Always valid | No separate queue needed; failed set IS the DLQ |
| Single-agent with sub-tasks | Multiple independent agent loops with shared tool layer | 2024-2025 | Avoids context pollution; sub-agents get scoped context |

**Deprecated/outdated:**
- `job.data.repeat` / `queue.add(..., {repeat})`: Deprecated in BullMQ v5, removed in v6. Use `upsertJobScheduler`.
- `function_call` / `role: 'function'`: Deprecated in OpenAI API. Use `tool_calls` / `role: 'tool'`.

---

## Open Questions

1. **How should the agent_state journal handle JSONB size growth over a long-running goal?**
   - What we know: `agent_state` uses JSONB with no size limit; Postgres JSONB can handle megabyte payloads but at increasing cost.
   - What's unclear: At what journal size does read performance degrade? Should there be a separate `goal_journal` table with one row per entry instead of an array in `agent_state`?
   - Recommendation: Start with `agent_state` JSONB array for simplicity. If a goal has more than ~100 sub-goals, migrate to a proper `goal_journal` table. For Phase 3, 100 sub-goals is an extreme upper bound.

2. **Should `completeWithTools` be added to the existing `AiProvider` interface or handled at the `ModelRouter` layer only?**
   - What we know: The current `AiProvider` interface has a single `complete(req)` method returning `CompletionResponse` (content string). Tool calling needs the full message object.
   - What's unclear: Whether OpenRouter's node-postgres provider will need tool-call format translation for non-OpenAI models.
   - Recommendation: Add `completeWithTools` as a new method on `AiProvider` interface, with a default implementation that calls through to the OpenAI client's `chat.completions.create` with `tools` parameter. This keeps the router clean.

3. **How to generate OpenAI-format JSON schemas from Zod `inputSchema` without adding a dependency?**
   - What we know: OpenAI function tool `parameters` must be a JSON Schema object. Zod schemas are TypeScript types, not JSON Schema.
   - What's unclear: Whether `zod-to-json-schema` is already transitively installed.
   - Recommendation: Check `node_modules` for `zod-to-json-schema`. If not present, manually write JSON Schema objects alongside each tool definition for Phase 3. Tool count is small (4-6 tools). Add `zod-to-json-schema` as a proper dep if more tools are added.

4. **What is the staggered restart delay between main agents?**
   - What we know: Multiple main agents must restart in sequence to avoid resource spikes (locked decision). Timing is Claude's discretion.
   - What's unclear: Optimal delay — too short causes the spike anyway; too long delays recovery.
   - Recommendation: Start with 2 seconds between agent restarts. This gives each agent time to connect to Postgres/Redis and begin its recovery read before the next one starts. Tune based on observed startup time.

---

## Sources

### Primary (HIGH confidence)
- Installed openai SDK v4.104.0 types (`/node_modules/.pnpm/openai@4.104.0.../openai/resources/chat/completions/completions.d.ts`) — `ChatCompletionTool`, `ChatCompletionMessageToolCall`, `finish_reason: 'tool_calls'` verified
- Installed BullMQ v5.69.3 types (`/node_modules/.pnpm/bullmq@5.69.3/...`) — `upsertJobScheduler`, `setGlobalConcurrency`, `cancelJob`, `UnrecoverableError`, `FlowProducer`, `BackoffOptions` all verified present
- Existing codebase (`apps/agent/src/`, `packages/ai/src/`, `packages/db/src/schema/`) — full inventory of what Phase 1 and 2 built

### Secondary (MEDIUM confidence)
- [OpenRouter Tool Calling docs](https://openrouter.ai/docs/guides/features/tool-calling) — request/response format, tool_calls structure, agentic loop pattern
- [OpenRouter Structured Outputs docs](https://openrouter.ai/docs/guides/features/structured-outputs) — `response_format: {type: 'json_schema'}`, supported models including claude-sonnet-4.5
- [BullMQ Retry docs](https://docs.bullmq.io/guide/retrying-failing-jobs) — exponential backoff configuration, jitter option
- [BullMQ Global Concurrency docs](https://docs.bullmq.io/guide/queues/global-concurrency) — `setGlobalConcurrency`, interaction with per-worker concurrency
- [BullMQ Repeatable Jobs docs](https://docs.bullmq.io/guide/jobs/repeatable) — cron pattern vs every, upsertJobScheduler survival across restarts
- [BullMQ Stop Retrying docs](https://docs.bullmq.io/patterns/stop-retrying-jobs) — `UnrecoverableError` pattern
- [Anthropic multi-agent research system blog](https://www.anthropic.com/engineering/multi-agent-research-system) — orchestrator-worker pattern, scoped context design, pitfalls (50-subagent over-decomposition, 15x token cost)
- [Fly.io Machine restart policy docs](https://fly.io/docs/machines/guides-examples/machine-restart-policy/) — `restart: always` for always-on processes

### Tertiary (LOW confidence)
- Web search results on LangGraph checkpointing (2025) — confirmed WAL/journal pattern is the standard approach; not adopting LangGraph, just pattern validation

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified against installed node_modules types; no new dependencies required
- Architecture: HIGH — patterns derive directly from verified library APIs and existing codebase structure
- Tool-calling protocol: HIGH — verified against installed openai SDK v4.104 types AND OpenRouter official docs
- BullMQ features: HIGH — verified against installed v5.69.3 types AND official docs
- Pitfalls: MEDIUM — derived from Anthropic engineering blog (primary source for multi-agent), BullMQ docs (primary source for queue), and cross-referenced with existing codebase patterns

**Research date:** 2026-02-18
**Valid until:** 2026-03-18 (30 days — BullMQ and openai SDK are stable; OpenRouter API changes occasionally)
