---
phase: 09-integration-gap-closure
plan: "01"
subsystem: agent-startup
tags: [credit-monitor, sub-agent, tool-registry, shutdown, multi-agent]
dependency_graph:
  requires: [08-04]
  provides: [CreditMonitor-lifecycle, lazy-tool-derivation, supervisor-full-tool-set]
  affects: [apps/agent/src/index.ts, apps/agent/src/shutdown.ts, apps/agent/src/multi-agent/agent-worker.ts]
tech_stack:
  added: []
  patterns: [lazy-registry-derivation, interval-lifecycle-management]
key_files:
  created: []
  modified:
    - apps/agent/src/index.ts
    - apps/agent/src/shutdown.ts
    - apps/agent/src/multi-agent/agent-worker.ts
decisions:
  - "CreditMonitor instantiated immediately after createRouter (before Phase 3) — polls balance on startup, then every 5 min"
  - "Supervisor + agentWorker moved to Phase 9 position (after Phase 8 re-derivation) so Supervisor receives all 30+ tools not just 7"
  - "tools param removed from createAgentWorker — lazy derivation inside job handler captures runtime tool_write additions"
  - "creditMonitor.stop() inserted at step 1.5 in gracefulShutdown() — after consolidation, before wallet (prevents event loop hang)"
metrics:
  duration: 2 min
  completed: "2026-02-19"
  tasks_completed: 2
  files_modified: 3
---

# Phase 09 Plan 01: Integration Gap Closure Summary

**One-liner:** CreditMonitor wired to agent startup/shutdown and sub-agent worker upgraded to lazy per-job tool derivation from registry.

## What Was Built

Two integration gaps identified during the v1 milestone audit were closed:

**Gap 1 — CreditMonitor never instantiated (COST-02):**
CreditMonitor was fully implemented in Phase 2 (`packages/ai/src/cost-monitor.ts`) but was never wired into the agent startup. This meant OpenRouter credit balance was never polled and low-credit Discord DMs never fired. The fix wires the lifecycle into `apps/agent/src/index.ts` (instantiate + start after `createRouter`) and `apps/agent/src/shutdown.ts` (stop in graceful shutdown at step 1.5).

**Gap 2 — Sub-agent worker stale tool snapshot (MULTI-02):**
`createAgentWorker` previously received a `tools: ChatCompletionTool[]` snapshot captured early in Phase 3 startup — before Phase 4 (wallet tools), Phase 6 (browser/identity/bootstrap tools), and Phase 8 (self-extension tools) registrations. Sub-agent LLM prompts therefore only saw ~7 tools instead of 30+. The fix removes the `tools` parameter entirely and instead calls `toolDefinitionsToOpenAI(registry)` at the start of each job handler (lazy per-job derivation). Additionally, the Supervisor construction and agentWorker creation were moved from their Phase 3 position to after the final Phase 8 `openAITools` re-derivation, so the Supervisor's initial tool array also includes all 30+ tools.

## Files Modified

### `apps/agent/src/index.ts`
- Added `CreditMonitor` to `@jarvis/ai` import
- Inserted `new CreditMonitor(...)` + `creditMonitor.start()` after `createRouter`, before model config log
- Moved `new Supervisor(...)` from Phase 3 block to new Phase 9 block (after Phase 8 `openAITools` re-derivation at line ~342)
- Moved `createAgentWorker(...)` to same Phase 9 block, removed `tools: openAITools` parameter
- Added `creditMonitor` to `registerShutdownHandlers` call

### `apps/agent/src/shutdown.ts`
- Added `creditMonitor?: { stop(): void }` field to `ShutdownResources` interface
- Added `creditMonitor` to destructuring in `registerShutdownHandlers`
- Added step 1.5 in `gracefulShutdown()`: `creditMonitor.stop()` after consolidation interval clear

### `apps/agent/src/multi-agent/agent-worker.ts`
- Added `import { toolDefinitionsToOpenAI } from '@jarvis/ai'`
- Removed `ChatCompletionTool` type alias
- Removed `tools: ChatCompletionTool[]` from `createAgentWorker` deps type and destructuring
- Added `const tools = toolDefinitionsToOpenAI(registry)` as first line of Worker job handler

## Verification Results

All 4 verification criteria confirmed:
1. `pnpm build` succeeds with zero TypeScript errors (both tasks)
2. `CreditMonitor` imported, instantiated, started, and passed to shutdown handlers in `index.ts`
3. `ShutdownResources.creditMonitor` field exists; `creditMonitor.stop()` called in `gracefulShutdown()`
4. `toolDefinitionsToOpenAI` imported in `agent-worker.ts`; no `tools` parameter on `createAgentWorker`; `const tools = toolDefinitionsToOpenAI(registry)` inside job handler

## Commits

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Wire CreditMonitor into agent startup and shutdown | 8c670f7 |
| 2 | Fix sub-agent worker stale tool snapshot via lazy derivation | 73bd62b |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

Files verified:
- FOUND: apps/agent/src/index.ts (CreditMonitor import, instantiation, Phase 9 block with Supervisor+Worker)
- FOUND: apps/agent/src/shutdown.ts (creditMonitor field, stop() in gracefulShutdown)
- FOUND: apps/agent/src/multi-agent/agent-worker.ts (toolDefinitionsToOpenAI import, lazy derivation inside job handler)

Commits verified:
- FOUND: 8c670f7 (feat(09-01): wire CreditMonitor into agent startup and shutdown)
- FOUND: 73bd62b (feat(09-01): fix sub-agent worker stale tool snapshot via lazy derivation)
