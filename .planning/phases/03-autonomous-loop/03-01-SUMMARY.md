---
phase: 03-autonomous-loop
plan: 01
subsystem: database, ai
tags: [postgres, drizzle, openai, zod, tool-calling, goals, sub-goals]

# Dependency graph
requires:
  - phase: 02-ai-backbone-and-safety
    provides: AiProvider interface, OpenRouterProvider, ModelRouter with kill switch and tier routing

provides:
  - goals table (source, status, priority, replanCount, pauseReason)
  - sub_goals table (goalId FK, dependsOn JSONB, status, outcome, agentJobId)
  - ToolCompletionRequest / ToolCompletionResponse types
  - AiProvider.completeWithTools interface method
  - OpenRouterProvider.completeWithTools implementation
  - ModelRouter.completeWithTools with kill switch + cost logging
  - zodToJsonSchema helper (no external dependency)
  - toolDefinitionsToOpenAI converter for tool registry → ChatCompletionTool[]

affects: [03-02-planning-engine, 03-03-tool-invocation-loop, 03-04-agent-worker, 03-05, 03-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Duck-typed registry interface in @jarvis/ai avoids hard dependency on @jarvis/tools"
    - "zodToJsonSchema manual converter avoids zod-to-json-schema package dependency"
    - "ToolCompletionResponse returns full ChatCompletionMessage — caller inspects tool_calls"
    - "content=null is valid for tool_calls responses — do NOT throw on null content"

key-files:
  created:
    - packages/db/src/schema/goals.ts
    - packages/db/src/schema/sub-goals.ts
    - packages/ai/src/tool-schema.ts
  modified:
    - packages/db/src/schema/index.ts
    - packages/db/drizzle.config.ts
    - packages/ai/src/provider.ts
    - packages/ai/src/openrouter.ts
    - packages/ai/src/router.ts
    - packages/ai/src/index.ts

key-decisions:
  - "goalId FK in sub_goals does NOT need AnyPgColumn — it references goals.id, not self-referential"
  - "zodToJsonSchema handles ZodOptional/ZodDefault by unwrapping — required[] only includes fields that are neither"
  - "ToolRegistryLike duck-typed interface in tool-schema.ts — @jarvis/ai does not depend on @jarvis/tools"
  - "completeWithTools does not check content===null — content is null for tool_calls responses and that is valid"
  - "ModelRouter.completeWithTools logs to ai_calls with same tier+cost pattern as complete()"

patterns-established:
  - "Pattern: All AI-facing tool schemas defined in @jarvis/ai/tool-schema.ts, not in @jarvis/tools"
  - "Pattern: zodToJsonSchema recursively unwraps ZodOptional/ZodDefault before generating JSON Schema"

requirements-completed: [LOOP-01, MULTI-05]

# Metrics
duration: 3min
completed: 2026-02-18
---

# Phase 3 Plan 1: Goals Schema and AI Tool-Calling Foundation Summary

**PostgreSQL goals/sub_goals lifecycle tables and OpenAI-compatible tool-calling via completeWithTools across AiProvider/OpenRouterProvider/ModelRouter, with a dependency-free Zod-to-JSON-Schema converter**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-18T21:02:20Z
- **Completed:** 2026-02-18T21:05:41Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments
- goals and sub_goals Drizzle tables with all lifecycle columns (source, status, replanCount, priority, pauseReason, dependsOn, agentJobId, outcome)
- AiProvider interface and OpenRouterProvider fully extended with completeWithTools returning ChatCompletionMessage (including tool_calls)
- ModelRouter.completeWithTools routing through tier system with kill switch enforcement and ai_calls cost logging
- zodToJsonSchema and toolDefinitionsToOpenAI exported from @jarvis/ai with no new npm dependencies

## Task Commits

Each task was committed atomically:

1. **Task 1: Create goals and sub_goals database schema** - `67beeb1` (feat)
2. **Task 2: Extend AiProvider and OpenRouterProvider with tool-calling** - `5d808f9` (feat)
3. **Task 3: Add ModelRouter.completeWithTools and tool-schema converter** - `4f89fab` (feat)

## Files Created/Modified
- `packages/db/src/schema/goals.ts` - Goal lifecycle table with source, status, priority, replanCount, pauseReason
- `packages/db/src/schema/sub-goals.ts` - Sub-goal decomposition table with goalId FK, dependsOn JSONB, status, outcome, agentJobId
- `packages/db/src/schema/index.ts` - Added goals and sub-goals barrel exports
- `packages/db/drizzle.config.ts` - Added goals.ts and sub-goals.ts to schema array
- `packages/ai/src/provider.ts` - Added ToolCompletionRequest, ToolCompletionResponse interfaces; completeWithTools on AiProvider
- `packages/ai/src/openrouter.ts` - Implemented completeWithTools with tools parameter and valid null-content handling
- `packages/ai/src/router.ts` - Added ModelRouter.completeWithTools with kill switch + ai_calls logging
- `packages/ai/src/tool-schema.ts` - zodToJsonSchema helper and toolDefinitionsToOpenAI converter
- `packages/ai/src/index.ts` - Added tool-schema.js barrel export

## Decisions Made
- goalId FK in sub_goals uses `.references(() => goals.id)` not AnyPgColumn — goals is a separate table, not self-referential, so plain reference works
- zodToJsonSchema does not use zod-to-json-schema package — manual recursive converter handles all Zod types present in tool schemas (ZodObject, ZodString, ZodNumber, ZodBoolean, ZodEnum, ZodArray, ZodRecord, ZodOptional, ZodDefault, ZodLiteral, ZodUnknown, ZodAny)
- ToolRegistryLike duck-typed interface instead of importing ToolRegistry from @jarvis/tools — keeps dep direction clean (ai does not depend on tools)
- completeWithTools does NOT throw when choice.message.content === null — this is the standard response format when finish_reason is 'tool_calls'

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- goals and sub_goals tables ready for the planning engine to insert/query goals
- completeWithTools available for the agent loop to make tool-calling decisions
- toolDefinitionsToOpenAI available to convert the tool registry for LLM tool selection
- Ready for 03-02 (planning engine) and 03-03 (tool invocation loop)

---
*Phase: 03-autonomous-loop*
*Completed: 2026-02-18*

## Self-Check: PASSED

All created files verified on disk. All task commits verified in git log.
- FOUND: packages/db/src/schema/goals.ts
- FOUND: packages/db/src/schema/sub-goals.ts
- FOUND: packages/ai/src/tool-schema.ts
- FOUND: .planning/phases/03-autonomous-loop/03-01-SUMMARY.md
- FOUND: 67beeb1 (Task 1 commit)
- FOUND: 5d808f9 (Task 2 commit)
- FOUND: 4f89fab (Task 3 commit)
