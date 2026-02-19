# Phase 9: Integration Gap Closure - Research

**Researched:** 2026-02-19
**Domain:** Agent startup wiring / TypeScript integration fixes
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| COST-02 | Operational alerting: OpenRouter credit balance is polled and low-credit Discord DM fires | CreditMonitor class fully implemented in `packages/ai/src/cost-monitor.ts`, exported from `@jarvis/ai`. Fix is to instantiate it in `apps/agent/src/index.ts` and wire `.stop()` into `shutdown.ts`. |
| MULTI-02 | Sub-agents have isolated LLM context focused on their assigned task | Isolated context is already correct (fresh messages array per job). The gap is tool *visibility*: `createAgentWorker` receives a stale `openAITools` snapshot. Fix is twofold: (1) move call site to after all tool registrations, (2) derive tools lazily per-job from the registry so post-startup `tool_write` additions are visible on next spawn. |

</phase_requirements>

---

## Summary

Phase 9 closes exactly two integration wiring gaps identified by the v1 milestone audit. Both gaps are in `apps/agent/src/index.ts` and involve objects that were built/implemented in earlier phases but never connected to the startup sequence.

**Gap 1 — CreditMonitor orphaned:** `CreditMonitor` is fully implemented in `packages/ai/src/cost-monitor.ts` and exported from `@jarvis/ai`. It is never imported or instantiated in `apps/agent/src/index.ts`. The fix is a two-line import, a constructor call in startup, and a `.stop()` call registered in `shutdown.ts`. No new code needs to be written; the class is complete.

**Gap 2 — Stale tool snapshot in sub-agent worker:** `createAgentWorker(...)` is called at line 148 of `index.ts`, before wallet (Phase 4 — lines 157-263), browser/identity/bootstrap (Phase 6 — lines 266-295), and self-extension (Phase 8 — lines 297-336) tools are registered. The `tools: openAITools` argument passed to the worker is a snapshot of Phase 1+3 tools only (7 tools). The fix has two parts: (a) move the `createAgentWorker(...)` call to after all tool registrations complete, and (b) change `agent-worker.ts` to derive `openAITools` lazily from the `registry` on each job start (using `toolDefinitionsToOpenAI(registry)`), so that tools written by `tool_write` after startup are visible on the next sub-agent spawn.

**Primary recommendation:** Both fixes are surgical changes to `index.ts` and `agent-worker.ts`. No new packages, no schema changes, no new files needed.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@jarvis/ai` | workspace | Provides `CreditMonitor`, `CreditMonitorConfig`, `toolDefinitionsToOpenAI` | Already the AI package — no new deps |
| `bullmq` | ^5.34.8 | BullMQ Worker for sub-agent jobs | Already used in `createAgentWorker` |
| Node.js `setInterval` / `clearInterval` | built-in | CreditMonitor internal polling loop | Already used by memory consolidation |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `discord.js` | (in `@jarvis/ai`) | Used by `sendOperatorDm` inside CreditMonitor | Already wired — no direct dep needed in agent |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Lazy `toolDefinitionsToOpenAI(registry)` per job | Passing updated snapshot on each tool_write | Lazy derivation is simpler: no callback plumbing needed, no stale reference possible |
| Lazy derivation | Keep frozen `tools` array, re-create worker on tool change | Re-creating the worker tears down in-flight jobs — too disruptive |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Project Structure

No structural changes needed. All changes are within existing files:

```
apps/agent/src/
├── index.ts                          # Two changes: CreditMonitor wiring, move createAgentWorker
├── shutdown.ts                       # Add creditMonitor to ShutdownResources, call .stop()
└── multi-agent/
    └── agent-worker.ts               # Remove `tools` param, derive lazily from registry per job
```

### Pattern 1: CreditMonitor Startup Wiring

**What:** Instantiate `CreditMonitor` with env vars, call `.start()` immediately after router creation, pass to shutdown handler.

**When to use:** Always — follows the same pattern as `startConsolidation()` (memory consolidation interval).

**Example:**
```typescript
// Source: packages/ai/src/cost-monitor.ts (CreditMonitor API)

// In index.ts — after router is created (Step 5), before Supervisor construction:
import { CreditMonitor } from '@jarvis/ai';

const creditMonitor = new CreditMonitor(
  {
    apiKey: process.env.OPENROUTER_API_KEY!,
    discordBotToken: process.env.DISCORD_BOT_TOKEN,
    discordOperatorUserId: process.env.DISCORD_OPERATOR_USER_ID,
    // checkIntervalMs defaults to 5 minutes
    // lowCreditThresholdUsd defaults to $5.00
  },
  db,
);
creditMonitor.start();

process.stderr.write('[agent] CreditMonitor started (polling every 5 minutes).\n');
```

### Pattern 2: CreditMonitor Shutdown Wiring

**What:** Add `creditMonitor` to `ShutdownResources` and call `.stop()` in `gracefulShutdown`.

**When to use:** Always — follows the same pattern as consolidation interval cleanup.

**Example:**
```typescript
// Source: apps/agent/src/shutdown.ts pattern

// Add to ShutdownResources interface:
export interface ShutdownResources {
  // ... existing fields ...
  /** Phase 9: CreditMonitor (OpenRouter balance polling) */
  creditMonitor?: { stop(): void };
}

// Add to gracefulShutdown() in step 1 area (before consolidation, or alongside it):
if (creditMonitor !== undefined) {
  creditMonitor.stop();
  process.stderr.write('[shutdown] CreditMonitor stopped.\n');
}
```

### Pattern 3: Move createAgentWorker After All Registrations

**What:** The `createAgentWorker(...)` call must appear after the final `openAITools = toolDefinitionsToOpenAI(registry)` re-derivation (currently at line 330, end of Phase 8 block).

**When to use:** This is a simple move of the existing call, no logic change.

**Example:**
```typescript
// REMOVE this block from the current Phase 3 position (after Supervisor construction):
// const agentWorker = createAgentWorker({
//   redisUrl: process.env.REDIS_URL!,
//   router,
//   registry,
//   killSwitch,
//   db,
//   tools: openAITools,   // <-- was stale Phase 1+3 snapshot
// });

// ADD after Phase 8 openAITools re-derivation (line 330 area):
const agentWorker = createAgentWorker({
  redisUrl: process.env.REDIS_URL!,
  router,
  registry,
  killSwitch,
  db,
  // tools param removed — worker now derives lazily from registry
});
```

### Pattern 4: Lazy Tool Derivation in Agent Worker

**What:** Remove the `tools: ChatCompletionTool[]` parameter from `createAgentWorker`. Instead, call `toolDefinitionsToOpenAI(registry)` at the start of each job handler to get a fresh snapshot. This ensures new tools written by `tool_write` are visible to the next sub-agent spawn.

**When to use:** Always — the registry object is passed by reference and always reflects the current state of registered tools.

**Example:**
```typescript
// Source: packages/ai/src/tool-schema.ts (toolDefinitionsToOpenAI API)
// In apps/agent/src/multi-agent/agent-worker.ts:

import { toolDefinitionsToOpenAI } from '@jarvis/ai';

export function createAgentWorker(deps: {
  redisUrl: string;
  router: ModelRouter;
  registry: ToolRegistry;     // <-- already present, used for tool invocation
  killSwitch: KillCheckable;
  db: DbClient;
  // tools: ChatCompletionTool[] — REMOVED
  concurrency?: number;
}): Worker {
  const { redisUrl, router, registry, killSwitch, db, concurrency = 3 } = deps;

  return new Worker(
    'agent-tasks',
    async (job) => {
      // Derive fresh tool snapshot from registry at job start
      // Captures any tools registered by tool_write after startup
      const tools = toolDefinitionsToOpenAI(registry);

      const { task, context } = job.data as { ... };
      // ... rest of job handler unchanged ...
      const response = await router.completeWithTools(messages, 'mid', tools);
    },
    { ... }
  );
}
```

### Anti-Patterns to Avoid

- **Passing `tools` snapshot at construction time:** The existing anti-pattern — the array is frozen at the moment `createAgentWorker` is called, so any tools registered after that point (Phase 4/6/8 on startup, or `tool_write` at runtime) are invisible to sub-agent LLM prompts.
- **Re-creating the Worker on tool change:** Tearing down and recreating the BullMQ Worker would drain in-flight sub-agent jobs, introduce a gap where new jobs are rejected, and require complex state management. Not needed — lazy derivation is sufficient.
- **Starting CreditMonitor before `router` is created:** `CreditMonitor` needs `db` (for future persistence) and `apiKey`. Both are available after Step 5. Starting it too early (before logging config) is harmless but creates misleading log ordering.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Credit balance polling | Custom fetch loop | `CreditMonitor.start()` | Already implemented with debounce, error handling, stderr fallback |
| Discord DM on low credits | Custom discord.js client | `sendOperatorDm()` inside CreditMonitor | Already implemented with proper Partials.Channel and client lifecycle |
| Fresh tool list per job | Custom tools re-derivation | `toolDefinitionsToOpenAI(registry)` | Already implemented in `@jarvis/ai`, handles Zod→JSON Schema conversion |

**Key insight:** This phase is pure wiring. Every component needed is already built and tested in earlier phases. The work is exclusively: import, instantiate, connect, and position correctly.

---

## Common Pitfalls

### Pitfall 1: Supervisor Also Holds a Stale openAITools Snapshot

**What goes wrong:** The `Supervisor` is constructed at line 135 with `openAITools` (Phase 1+3 only). Like the agent worker, it stores this as `this.tools` and passes it to each `AgentLoop`. After Phase 4/6/8 registrations, `openAITools` is re-derived but the Supervisor's stored `this.tools` is the old reference.

**Why it happens:** The Supervisor is also constructed before Phase 4/6/8 tools are registered in the current code.

**How to avoid:** The audit fix described in the ROADMAP only mentions moving `createAgentWorker`. Inspect whether the Supervisor construction should also be moved, or whether the Supervisor should be updated via a method (e.g., `supervisor.setTools(openAITools)`) after all registrations. The simplest fix consistent with the plan is to move Supervisor construction too, or construct it before Phase 3 but update it after all registrations via a setter.

**Warning signs:** Main agent loops also showing only Phase 1+3 tools in LLM prompts (separate symptom from sub-agent issue).

> **Resolution:** Looking at `index.ts` line 135-145 and line 330, the `supervisor` is passed `openAITools` at construction. After Phase 8, `openAITools` is re-derived but the supervisor already holds the old reference. The Phase 9 fix plan says "move createAgentWorker after all tool registrations" — the planner must decide whether to also move Supervisor construction (cleanest) or add a setter. The audit and plan description only explicitly call out `createAgentWorker`, not Supervisor. This is worth flagging.

### Pitfall 2: Forgetting OPENROUTER_API_KEY! Non-Null Assertion

**What goes wrong:** `process.env.OPENROUTER_API_KEY!` is already used at line 70 for `createRouter`. Using `!` means a missing key produces a runtime error, not a compile error. The same key should be passed to `CreditMonitor` without needing a separate guard.

**Why it happens:** TypeScript env var types are always `string | undefined`; non-null assertion is the pattern used throughout this codebase.

**How to avoid:** Use the same `process.env.OPENROUTER_API_KEY!` pattern already used for `createRouter`. No additional check needed.

### Pitfall 3: CreditMonitor stop() Must Be Called in Shutdown

**What goes wrong:** If `CreditMonitor.stop()` is not called in `gracefulShutdown`, the interval timer keeps the Node.js event loop alive, potentially delaying process exit. The 10-second force-kill timer in `shutdown.ts` will eventually fire, but graceful exit won't complete cleanly.

**Why it happens:** `setInterval` prevents process exit unless explicitly cleared.

**How to avoid:** Add `creditMonitor` to `ShutdownResources` and call `.stop()` early in `gracefulShutdown` (before or alongside `clearInterval(consolidation)`).

### Pitfall 4: tools Parameter Removal Breaks index.ts Call Site

**What goes wrong:** If `agent-worker.ts` removes the `tools` parameter from `createAgentWorker`, the call site in `index.ts` must also remove `tools: openAITools` from the options object. TypeScript will catch this at compile time, but it's easy to miss if only changing one file.

**Why it happens:** The `deps` object in `createAgentWorker` is destructured — extra keys passed by the caller are silently ignored by TypeScript only if the type is updated. If the type still has `tools?` as optional, no error fires.

**How to avoid:** Remove `tools` from both the `createAgentWorker` deps type AND the call site in `index.ts`. Run `pnpm build` to confirm no TypeScript errors.

### Pitfall 5: Lazy Tool Derivation Performance

**What goes wrong:** Calling `toolDefinitionsToOpenAI(registry)` on every job start traverses all 30+ tool definitions and converts Zod schemas to JSON Schema objects. This is O(n tools) work per sub-agent job.

**Why it happens:** Each call to `toolDefinitionsToOpenAI` re-traverses the registry.

**How to avoid:** The overhead is negligible — 30+ small Zod schema conversions is microseconds compared to the LLM API call that follows. This is not a real concern; prefer correctness over premature optimization.

---

## Code Examples

Verified patterns from the existing codebase:

### CreditMonitor Constructor and Start

```typescript
// Source: packages/ai/src/cost-monitor.ts (lines 42-153)
// CreditMonitor full interface:

export interface CreditMonitorConfig {
  apiKey: string;                     // REQUIRED — OPENROUTER_API_KEY
  discordBotToken?: string;           // Optional — skips DM if absent
  discordOperatorUserId?: string;     // Optional — skips DM if absent
  checkIntervalMs?: number;           // Default: 300_000 (5 minutes)
  lowCreditThresholdUsd?: number;     // Default: 5.0 ($5.00)
}

// start() calls recordBalance() immediately, then on interval
creditMonitor.start();

// stop() calls clearInterval
creditMonitor.stop();
```

### toolDefinitionsToOpenAI Lazy Call Pattern

```typescript
// Source: packages/ai/src/tool-schema.ts (lines 141-160)
// toolDefinitionsToOpenAI accepts a duck-typed registry:
// { list(): Array<{ name: string; description: string }>; get(name: string): { inputSchema: unknown } | undefined }
// ToolRegistry already satisfies this interface.

import { toolDefinitionsToOpenAI } from '@jarvis/ai';

// Inside the Worker job handler (per-job, not per-worker):
const tools = toolDefinitionsToOpenAI(registry);
const response = await router.completeWithTools(messages, 'mid', tools);
```

### ShutdownResources Extension Pattern

```typescript
// Source: apps/agent/src/shutdown.ts (lines 63-82)
// Existing pattern for optional shutdown resources:

export interface ShutdownResources {
  pool: ShutdownPool;
  redis: ShutdownRedis;
  worker?: Worker;
  consolidation?: ReturnType<typeof setInterval>;
  supervisor?: ShutdownSupervisor;
  agentWorker?: Worker;
  agentTasksQueue?: { close(): Promise<void> };
  signerProcess?: ShutdownSignerProcess;
  walletSubscription?: { stop: () => void };
  browserManager?: ShutdownBrowserManager;
  reloadToolsQueue?: { close(): Promise<void> };
  // ADD:
  creditMonitor?: { stop(): void };
}
```

### Current createAgentWorker Position (the bug)

```typescript
// Source: apps/agent/src/index.ts (lines 147-155) — THIS IS THE BUG LOCATION
// openAITools at this point = Phase 1+3 tools only (7 tools)

// Create agent-tasks worker (processes sub-agent BullMQ jobs)
const agentWorker = createAgentWorker({
  redisUrl: process.env.REDIS_URL!,
  router,
  registry,
  killSwitch,
  db,
  tools: openAITools,   // STALE: Phase 1+3 only
});

// Phase 4/6/8 tool registrations happen AFTER this line
// By line 330: openAITools has 30+ tools but agentWorker was already created with 7
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Static tools array passed at Worker construction | Lazy `toolDefinitionsToOpenAI(registry)` per job | Phase 9 (this phase) | Sub-agents see all registered tools including runtime-added tools |
| CreditMonitor implemented but orphaned | CreditMonitor wired into startup/shutdown | Phase 9 (this phase) | Low-credit Discord alerts fire; OpenRouter balance is polled every 5 min |

**Deprecated/outdated:**
- Passing `tools: openAITools` to `createAgentWorker` at Phase 3 bootstrap time — replaced by lazy registry derivation.

---

## Open Questions

1. **Does Supervisor also need to be moved or updated?**
   - What we know: `Supervisor` is constructed at line 135 with the Phase 1+3 `openAITools` snapshot. Supervisor stores this as `this.tools` and passes it to each `AgentLoop` it spawns. After Phase 8, `openAITools` is re-derived but supervisor doesn't see it.
   - What's unclear: The ROADMAP plan description says "move createAgentWorker after all tool registrations" without mentioning Supervisor. Is the Supervisor's stale tools a known separate issue (perhaps acceptable because the main agent loop still works via the registry for invocation)?
   - Recommendation: The plan description (`09-01-PLAN.md`) bundles both fixes together. The planner should explicitly decide: either (a) also move Supervisor construction to after Phase 8, or (b) add a `setTools(tools)` method to Supervisor to update it post-registration. Option (a) is simpler. Option (b) is more surgical but adds API surface. Given the single-plan scope, option (a) (move both Supervisor and agentWorker) is the cleaner approach.

2. **Should CreditMonitor be started before or after wallet/browser initialization?**
   - What we know: CreditMonitor only needs `apiKey` and `db`. It can start any time after Step 5 (router creation). Starting it early means the first balance check fires sooner.
   - What's unclear: If the agent takes a long time to complete Phase 4 (waiting for signer co-process), a low-credit warning could fire before full startup completes. This is harmless but unusual timing.
   - Recommendation: Start CreditMonitor immediately after `createRouter(...)` (Step 5 area). This mirrors how `startConsolidation(db)` is called early (Step 3). No reason to defer.

---

## Sources

### Primary (HIGH confidence)

- `apps/agent/src/index.ts` — Full startup sequence, current ordering, exact line numbers of all gaps
- `packages/ai/src/cost-monitor.ts` — Complete CreditMonitor implementation: API, start/stop, polling, debounce
- `packages/ai/src/tool-schema.ts` — `toolDefinitionsToOpenAI` implementation and ToolRegistryLike interface
- `apps/agent/src/multi-agent/agent-worker.ts` — Current createAgentWorker implementation showing stale tools capture
- `apps/agent/src/shutdown.ts` — ShutdownResources interface and gracefulShutdown pattern
- `.planning/v1-MILESTONE-AUDIT.md` — Authoritative gap documentation with exact file/line references

### Secondary (MEDIUM confidence)

- `.planning/ROADMAP.md` — Phase 9 plan description: "Wire CreditMonitor into agent startup/shutdown + move createAgentWorker after all tool registrations"

### Tertiary (LOW confidence)

None.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All libraries already in use; no new dependencies
- Architecture: HIGH — All patterns verified directly from source code with line references
- Pitfalls: HIGH — Gaps identified by authoritative audit document; code verified directly

**Research date:** 2026-02-19
**Valid until:** 2026-03-19 (stable — pure wiring fix, no external dependencies)
