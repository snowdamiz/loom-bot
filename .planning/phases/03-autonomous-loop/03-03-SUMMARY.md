---
phase: 03-autonomous-loop
plan: 03
subsystem: ai, queue
tags: [bullmq, multi-agent, sub-agent, redis, tool-calling, zod]

# Dependency graph
requires:
  - phase: 03-autonomous-loop
    plan: 01
    provides: ModelRouter.completeWithTools, ToolCompletionRequest type, tool-calling infrastructure
  - phase: 01-infrastructure
    provides: BullMQ, Redis, ToolRegistry, invokeWithKillCheck, DbClient

provides:
  - createSpawnAgentTool: BullMQ queue.add factory producing spawn-agent ToolDefinition
  - createAwaitAgentTool: polling factory producing await-agent ToolDefinition (5 min timeout)
  - createCancelAgentTool: moveToFailed factory producing cancel-agent ToolDefinition
  - createAgentWorker: BullMQ Worker on agent-tasks queue with isolated LLM context per job

affects: [03-04, 03-05, 03-06]

# Tech tracking
tech-stack:
  added:
    - "zod ^3.24.2 as direct dep in apps/agent (pnpm strict isolation requires explicit declaration)"
  patterns:
    - "ChatCompletionMessageParam extracted from ToolCompletionRequest['messages'][number] — no direct openai dep in apps/agent"
    - "removeOnFail omitted from WorkerOptions — preserves failed jobs indefinitely for DLQ inspection"
    - "Sub-agent context isolation: fresh messages array per job, task + scoped context only"

key-files:
  created:
    - apps/agent/src/multi-agent/sub-agent-tool.ts
    - apps/agent/src/multi-agent/agent-worker.ts
  modified:
    - apps/agent/package.json

key-decisions:
  - "zod added as direct dep to apps/agent — pnpm strict isolation prevents transitive zod access from @jarvis/tools"
  - "ChatCompletionMessageParam sourced via ToolCompletionRequest['messages'][number] — established pattern from agent-loop.ts, avoids direct openai dep"
  - "removeOnFail omitted (not false) in WorkerOptions — BullMQ v5 WorkerOptions.removeOnFail is KeepJobs|undefined, not boolean"
  - "Sub-agents use 'mid' tier not 'strong' — focused scoped tasks don't require frontier reasoning capability"

patterns-established:
  - "Pattern: Type extraction from ToolCompletionRequest generics avoids direct openai imports in apps/agent"
  - "Pattern: omit removeOnFail to preserve DLQ jobs; set removeOnComplete: { age: 3600 } for normal cleanup"

requirements-completed: [MULTI-01, MULTI-02, MULTI-03, MULTI-04, MULTI-05]

# Metrics
duration: 6min
completed: 2026-02-18
---

# Phase 3 Plan 3: Sub-Agent Spawning Tools and BullMQ Worker Summary

**BullMQ-backed sub-agent system with three tool factories (spawn-agent, await-agent, cancel-agent) and an isolated-context LLM loop worker on the agent-tasks queue**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-18T21:08:47Z
- **Completed:** 2026-02-18T21:14:37Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Three tool factory functions (createSpawnAgentTool, createAwaitAgentTool, createCancelAgentTool) enabling the main agent to delegate tasks to isolated sub-agents via BullMQ
- BullMQ Worker (createAgentWorker) processing agent-tasks queue jobs with fully isolated LLM context (fresh messages array per job) and a 15-turn mini agentic loop
- Sub-agents share the ModelRouter instance (shared ai_calls cost logging) while maintaining isolated LLM contexts per MULTI-02 requirement
- TypeScript compilation clean across the full monorepo (npx turbo build: 6 successful)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create spawn-agent, await-agent, and cancel-agent tool definitions** - `67d8a9b` (feat)
2. **Task 2: Create agent-tasks BullMQ worker for sub-agent execution** - `bea1b26` (feat)

**Plan metadata:** (see final commit below)

## Files Created/Modified
- `apps/agent/src/multi-agent/sub-agent-tool.ts` - Three tool factory functions: createSpawnAgentTool (enqueues with removeOnComplete age + no removeOnFail), createAwaitAgentTool (polls every 2s, 300s timeout), createCancelAgentTool (moveToFailed for cancellation)
- `apps/agent/src/multi-agent/agent-worker.ts` - BullMQ Worker on agent-tasks queue; buildSubAgentSystemPrompt; mini agentic loop (max 15 turns, 'mid' tier, full tool_calls execution via invokeWithKillCheck)
- `apps/agent/package.json` - Added zod ^3.24.2 as direct dependency (pnpm strict isolation)

## Decisions Made
- Added `zod` as direct dependency to `apps/agent` — pnpm strict isolation does not allow transitive dependency access; apps/agent cannot use zod from @jarvis/tools's node_modules
- Used `ToolCompletionRequest['messages'][number]` type extraction instead of importing from `openai/resources/chat/completions` — matches the established pattern from `agent-loop.ts` in the same package
- `removeOnFail` omitted from WorkerOptions rather than set to `false` — BullMQ v5's `WorkerOptions.removeOnFail` is typed as `KeepJobs | undefined` (not `boolean`), so `false` causes a type error. Omitting it preserves all failed jobs for DLQ inspection (QUEUE-02)
- Sub-agents use `'mid'` tier not `'strong'` — per plan spec; focused scoped tasks don't require frontier reasoning capability, and using mid tier reduces cost per the plan's locked decision

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added zod as direct dep to apps/agent**
- **Found during:** Task 1 (sub-agent-tool.ts creation)
- **Issue:** `import { z } from 'zod'` failed with TS2307 — zod not in apps/agent's direct dependencies; pnpm strict isolation prevents transitive access
- **Fix:** `pnpm --filter @jarvis/agent add "zod@^3.24.2"` to add zod v3 matching packages/tools
- **Files modified:** apps/agent/package.json, pnpm-lock.yaml
- **Verification:** TypeScript compiled cleanly after install
- **Committed in:** 67d8a9b (Task 1 commit)

**2. [Rule 1 - Bug] Fixed ChatCompletionMessageParam import in agent-worker.ts**
- **Found during:** Task 2 (agent-worker.ts creation)
- **Issue:** `import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'` fails — openai not a direct dep of apps/agent (pnpm strict isolation)
- **Fix:** Used type extraction pattern `type ChatCompletionMessageParam = ToolCompletionRequest['messages'][number]` per established pattern in agent-loop.ts
- **Files modified:** apps/agent/src/multi-agent/agent-worker.ts
- **Verification:** TypeScript compiled cleanly
- **Committed in:** bea1b26 (Task 2 commit)

**3. [Rule 1 - Bug] Fixed removeOnFail: false type error in WorkerOptions**
- **Found during:** Task 2 (agent-worker.ts creation)
- **Issue:** `removeOnFail: false` causes TS2322 — BullMQ v5 WorkerOptions.removeOnFail is `KeepJobs | undefined`, not boolean
- **Fix:** Omitted removeOnFail entirely — DLQ preservation is achieved by not setting any retention limit, same DLQ effect
- **Files modified:** apps/agent/src/multi-agent/agent-worker.ts
- **Verification:** TypeScript compiled cleanly
- **Committed in:** bea1b26 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking dep, 2 bugs)
**Impact on plan:** All auto-fixes necessary for type correctness and pnpm isolation compliance. No scope creep. Functional behavior matches plan spec exactly.

## Issues Encountered
- `npx tsc` on macOS uses system TypeScript (5.9.3) which has different zod type resolution from project TypeScript (5.7.3). Verification done with project-local `node_modules/.bin/tsc` which is the canonical compiler for this project.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- spawn-agent, await-agent, cancel-agent tools ready to be registered in the main agent's ToolRegistry
- createAgentWorker ready to be instantiated with the shared ModelRouter, ToolRegistry, and db client
- The agent-tasks BullMQ queue connects sub-agent-tool.ts (enqueue) to agent-worker.ts (process)
- Ready for 03-04 (agent worker startup wiring these into the main agent process)

---
*Phase: 03-autonomous-loop*
*Completed: 2026-02-18*

## Self-Check: PASSED

All created files verified on disk. All task commits verified in git log.
- FOUND: apps/agent/src/multi-agent/sub-agent-tool.ts
- FOUND: apps/agent/src/multi-agent/agent-worker.ts
- FOUND: .planning/phases/03-autonomous-loop/03-03-SUMMARY.md
- FOUND: 67d8a9b (Task 1 commit)
- FOUND: bea1b26 (Task 2 commit)
