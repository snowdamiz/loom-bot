# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core value:** The agent must be able to autonomously reason about opportunities, acquire the tools and accounts it needs, and execute money-making strategies without human intervention.
**Current focus:** Phase 2: AI Backbone and Safety — In Progress (1/3 plans complete)

## Current Position

Phase: 2 of 8 (AI Backbone and Safety)
Plan: 1 of 3 in current phase (02-01 complete)
Status: Phase 2 In Progress
Last activity: 2026-02-18 — Completed 02-01 (@jarvis/ai package: AiProvider, OpenRouterProvider, ModelRouter, KillSwitchGuard, 4 DB tables)

Progress: [████░░░░░░] 15%

## Performance Metrics

**Velocity:**
- Total plans completed: 5
- Average duration: 5.8 min
- Total execution time: 0.46 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-infrastructure | 4/4 | 26 min | 6.5 min |
| 02-ai-backbone-and-safety | 1/3 | 3 min | 3 min |

**Recent Trend:**
- Last 5 plans: 01-01 (6 min), 01-02 (7 min), 01-03 (8 min), 01-04 (5 min), 02-01 (3 min)
- Trend: stable

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 8 phases derived from 89 requirements; safety systems precede capabilities; research SUMMARY.md phase structure adopted with refinements for comprehensive depth
- [01-01]: jarvis-postgres uses port 5433 (port 5432 occupied by another project on host) — all DATABASE_URL must use 5433
- [01-01]: drizzle.config.ts enumerates individual schema .ts files (not barrel index) to avoid drizzle-kit CJS .js resolution failure
- [01-01]: Append-only LOG-05 compliance via two-row pattern — initial row immutable, completion inserts new row with parentId FK
- [01-01]: AnyPgColumn type required for self-referential FK callbacks in TypeScript strict mode
- [01-02]: DbClient from @jarvis/db used as logger db param type — avoids drizzle-orm direct dep in @jarvis/logging (pnpm strict isolation)
- [01-02]: ioredis named export { Redis } required for NodeNext moduleResolution — default import causes TS2351 no-construct-signatures
- [01-02]: Redis error handler writes to stderr only — Postgres unavailable during Redis failures, stderr always available
- [01-02]: session: prefix for all Redis keys — BullMQ uses separate prefix, avoids key collisions
- [01-03]: ZodType<TInput, ZodTypeDef, unknown> for inputSchema — third generic param unknown allows ZodDefault fields without TypeScript variance errors
- [01-03]: createDbTool(db) factory pattern — DB tool requires DbClient injection at registry creation, not module load time
- [01-03]: sql imported from @jarvis/db (not drizzle-orm) — pnpm strict isolation prevents transitive imports
- [01-03]: shell: false always in spawn — avoids shell injection even in unrestricted agent mode; args passed as array
- [01-04]: ShutdownPool/ShutdownRedis duck-typing interfaces — apps/agent cannot import ioredis/pg directly (not direct deps); structural interfaces satisfy the contract
- [01-04]: drizzle-orm operators (eq, and, gt, etc.) re-exported from @jarvis/db — extends the sql re-export pattern from 01-01 for full operator access under pnpm isolation
- [01-04]: Memory consolidation joins success rows to parent started rows via parentId to get actual tool names (two-row pattern stores toolName='completion' on success rows)
- [01-04]: consolidate() runs immediately at startup before setInterval to process results from previous agent runs without waiting 5 minutes
- [02-01]: OpenRouter via openai SDK with baseURL='https://openrouter.ai/api/v1' — compatible with OpenAI wire protocol, no custom HTTP client needed
- [02-01]: Model defaults: strong=anthropic/claude-opus-4.6, mid=anthropic/claude-sonnet-4.5, cheap=x-ai/grok-4.1-fast per Phase 2 research
- [02-01]: Env-var model config (JARVIS_MODEL_STRONG/MID/CHEAP) over DB storage — models swappable without redeploy
- [02-01]: OpenRouter cost field accessed via cast (usage as unknown as { cost?: number }) — non-SDK extension
- [02-01]: cost_category as pgEnum (not text constraint) — enforced at DB level; costUsd uses numeric(12,8) not float for financial precision

### Pending Todos

None.

### Blockers/Concerns

- Research flags Phase 4 (Wallet) signing service architecture as needing deeper research during planning
- Research flags Phase 7 (Strategy Engine) as LOW confidence frontier territory
- Research flags Phase 8 (Self-Extension) code sandbox safety as needing research
- REQUIREMENTS.md states 82 total requirements but actual count is 91; traceability table corrected

## Session Continuity

Last session: 2026-02-18
Stopped at: Completed 02-01 (@jarvis/ai package: AiProvider, OpenRouterProvider, ModelRouter, KillSwitchGuard, 4 DB tables)
Resume file: .planning/phases/02-ai-backbone-and-safety/02-02-PLAN.md
