---
phase: 02-ai-backbone-and-safety
plan: 01
subsystem: ai
tags: [openrouter, openai-sdk, drizzle, postgres, zod, kill-switch, model-routing]

# Dependency graph
requires:
  - phase: 01-infrastructure
    provides: DbClient, agentState table, schema patterns, pnpm isolation conventions

provides:
  - "@jarvis/ai package: AiProvider interface, OpenRouterProvider, ModelRouter, KillSwitchGuard, loadModelConfig, createRouter"
  - "ai_calls table: per-call AI usage logging with model, tier, tokens, cost_usd"
  - "operating_costs table: cost tracking by category (ai_inference, vm, api_service, other)"
  - "revenue table: strategy P&L tracking schema (populated in later phases)"
  - "kill_switch_audit table: audit trail for kill switch activation/deactivation"

affects:
  - 02-02-ai-cli-and-kill-switch
  - 02-03-cost-monitoring
  - 03-tool-gate
  - all downstream AI-consuming packages

# Tech tracking
tech-stack:
  added:
    - openai@^4.x (openai SDK used as OpenRouter HTTP client)
    - zod@^3.24.x (ModelTierConfig validation)
  patterns:
    - "AiProvider interface: adding a new provider = implement interface, no router changes"
    - "Tier resolution: 'strong'|'mid'|'cheap' -> concrete OpenRouter model IDs via env vars"
    - "Kill switch enforcement: assertActive() called before every AI completion"
    - "1-second DB cache: KillSwitchGuard avoids round-trips on consecutive calls"
    - "Numeric decimal: costUsd uses numeric(12,8) not float for financial precision"
    - "String-to-numeric: Drizzle numeric columns accept string values for exact decimal"

key-files:
  created:
    - packages/ai/src/provider.ts
    - packages/ai/src/openrouter.ts
    - packages/ai/src/config.ts
    - packages/ai/src/kill-switch.ts
    - packages/ai/src/router.ts
    - packages/ai/src/index.ts
    - packages/ai/package.json
    - packages/ai/tsconfig.json
    - packages/db/src/schema/ai-calls.ts
    - packages/db/src/schema/operating-costs.ts
    - packages/db/src/schema/revenue.ts
    - packages/db/src/schema/kill-switch-audit.ts
  modified:
    - packages/db/src/schema/index.ts
    - packages/db/drizzle.config.ts
    - pnpm-lock.yaml

key-decisions:
  - "OpenRouter via openai SDK: use openai package with baseURL='https://openrouter.ai/api/v1' — compatible with existing SDK tooling, OpenRouter supports the OpenAI wire protocol"
  - "Model defaults: strong=anthropic/claude-opus-4.6, mid=anthropic/claude-sonnet-4.5, cheap=x-ai/grok-4.1-fast per user research decision"
  - "Env-var model config: JARVIS_MODEL_STRONG/MID/CHEAP override defaults — no redeploy needed to swap models"
  - "costUsd from OpenRouter extension: cast usage as { cost?: number } to access non-SDK field"
  - "cost_category as pgEnum: enforced at DB level, cleaner than text constraint"

patterns-established:
  - "AiProvider interface: stable contract for adding providers without router changes"
  - "KillSwitchGuard: 1-second TTL cache balances freshness vs DB load"
  - "createRouter factory: convenience wiring avoids boilerplate at call sites"

requirements-completed: [MODL-01, MODL-02, MODL-03, MODL-04, MODL-05, KILL-02, KILL-04, COST-01]

# Metrics
duration: 3min
completed: 2026-02-18
---

# Phase 2 Plan 01: AI Backbone and Safety Summary

**@jarvis/ai package with tier-based ModelRouter, 1-second cached KillSwitchGuard, OpenRouterProvider via openai SDK, and 4 Postgres tables for AI cost and audit tracking**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-18T19:08:23Z
- **Completed:** 2026-02-18T19:11:30Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments

- 4 new Postgres tables pushed (ai_calls, operating_costs, revenue, kill_switch_audit) for cost tracking and safety auditing
- @jarvis/ai package compiles cleanly with AiProvider interface, OpenRouterProvider, ModelRouter, KillSwitchGuard, loadModelConfig, and createRouter factory
- ModelRouter enforces kill switch before every AI call and logs each completion with token counts and cost to ai_calls
- KillSwitchGuard uses 1-second DB cache to avoid per-call round-trips while ensuring freshness

## Task Commits

Each task was committed atomically:

1. **Task 1: Add 4 new DB schema tables and push to Postgres** - `3e6c2c1` (feat)
2. **Task 2: Create @jarvis/ai package with provider, router, kill switch, and config** - `86d3227` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `packages/db/src/schema/ai-calls.ts` - ai_calls table: model, tier, tokens, costUsd (numeric 12,8), optional goalId
- `packages/db/src/schema/operating-costs.ts` - operating_costs table with cost_category pgEnum
- `packages/db/src/schema/revenue.ts` - revenue table for strategy P&L (schema only)
- `packages/db/src/schema/kill-switch-audit.ts` - kill_switch_audit table for activation history
- `packages/db/src/schema/index.ts` - Added 4 new export lines
- `packages/db/drizzle.config.ts` - Now enumerates all 9 schema files
- `packages/ai/src/provider.ts` - AiProvider interface, CompletionRequest/Response/Usage types
- `packages/ai/src/openrouter.ts` - OpenRouterProvider using openai SDK pointed at OpenRouter
- `packages/ai/src/config.ts` - Tier type, ModelTierConfig, Zod schema, loadModelConfig()
- `packages/ai/src/kill-switch.ts` - KillSwitchGuard with 1-second TTL cache, KillSwitchActiveError
- `packages/ai/src/router.ts` - ModelRouter: kill switch + tier resolution + ai_calls logging
- `packages/ai/src/index.ts` - Barrel exports + createRouter() convenience factory
- `packages/ai/package.json` - Package config with openai and zod deps
- `packages/ai/tsconfig.json` - Extends @jarvis/typescript-config/base.json

## Decisions Made

- OpenRouter via openai SDK: `new OpenAI({ baseURL: 'https://openrouter.ai/api/v1' })` — compatible with existing SDK, OpenRouter supports OpenAI wire protocol
- Model defaults: strong=anthropic/claude-opus-4.6, mid=anthropic/claude-sonnet-4.5, cheap=x-ai/grok-4.1-fast per Phase 2 research
- Env-var model config (JARVIS_MODEL_STRONG/MID/CHEAP) over DB storage — models swappable without redeploy
- OpenRouter `cost` field accessed via `(usage as unknown as { cost?: number }).cost` — non-SDK extension requiring cast
- cost_category as pgEnum (not text constraint) — enforced at DB level

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required during this plan. OPENROUTER_API_KEY will be needed at runtime when plan 02-02 wires the CLI.

## Next Phase Readiness

- @jarvis/ai is ready for 02-02 (CLI and kill switch commands) which will add the CLI interface for toggling the kill switch and testing model routing
- @jarvis/ai is ready for 02-03 (cost monitoring) which will query ai_calls and operating_costs for P&L reporting
- ModelRouter.complete() is the primary interface all downstream agent code will call for AI completions

---
*Phase: 02-ai-backbone-and-safety*
*Completed: 2026-02-18*

## Self-Check: PASSED

- All 11 source files: FOUND
- All 4 DB tables in Postgres: FOUND (ai_calls, operating_costs, revenue, kill_switch_audit)
- Task commit 3e6c2c1: FOUND
- Task commit 86d3227: FOUND
- SUMMARY.md: FOUND
