# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core value:** The agent must be able to autonomously reason about opportunities, acquire the tools and accounts it needs, and execute money-making strategies without human intervention.
**Current focus:** Phase 3: Autonomous Loop — In Progress (4/6 plans complete)

## Current Position

Phase: 3 of 8 (Autonomous Loop)
Plan: 4 of 6 in current phase (03-04 complete)
Status: Phase 3 In Progress
Last activity: 2026-02-18 — Completed 03-04 (BullMQ retry config, DLQ, exponential backoff, cron scheduler)

Progress: [████████░░] 40%

## Performance Metrics

**Velocity:**
- Total plans completed: 9
- Average duration: 3.4 min
- Total execution time: 0.52 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-infrastructure | 4/4 | 26 min | 6.5 min |
| 02-ai-backbone-and-safety | 3/3 | 9 min | 3 min |
| 03-autonomous-loop | 4/6 | 12 min | 3 min |

**Recent Trend:**
- Last 5 plans: 02-01 (3 min), 02-02 (3 min), 03-01 (3 min), 03-04 (3 min)
- Trend: stable

*Updated after each plan completion*
| Phase 02-ai-backbone-and-safety P02 | 4 | 2 tasks | 11 files |
| Phase 03-autonomous-loop P01 | 3 | 3 tasks | 8 files |
| Phase 03-autonomous-loop P04 | 3 | 2 tasks | 3 files |

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
- [02-03]: GET /api/v1/key not /api/v1/credits for balance polling — /api/v1/credits requires management key; /api/v1/key works with standard API key
- [02-03]: Partials.Channel required in discord.js v14 for DM support — without it bot cannot send/receive direct messages
- [02-03]: P&L as query functions not SQL views — drizzle db:push does not manage Postgres views; query functions equally type-safe
- [02-03]: coalesce(sum(...), '0') pattern — returns '0' string on empty tables, parsed to 0 number; avoids null arithmetic in getPnl
- [02-03]: getAiSpendSummary() queries ai_calls directly — no need to bridge to operating_costs since ai_calls stores per-call cost data
- [Phase 02-ai-backbone-and-safety]: CLI commands use activateKillSwitch/deactivateKillSwitch helpers from @jarvis/ai — DRY and centralizes the upsert+audit logic
- [Phase 02-02]: KillCheckable duck-typed interface in invoke-safe.ts — @jarvis/tools does not depend on @jarvis/ai, keeps dep graph clean (tools->db, not tools->ai->db)
- [Phase 02-02]: Worker creates KillSwitchGuard at module level — 1s cache shared across all 5 concurrent BullMQ jobs avoids redundant DB queries under load
- [Phase 03-01]: goalId FK in sub_goals uses plain .references() not AnyPgColumn — not self-referential
- [Phase 03-01]: zodToJsonSchema manual converter in @jarvis/ai — no zod-to-json-schema package, handles all tool Zod types
- [Phase 03-01]: ToolRegistryLike duck-typed interface in tool-schema.ts — @jarvis/ai does not depend on @jarvis/tools
- [Phase 03-01]: completeWithTools does NOT throw on content===null — valid response format for finish_reason=tool_calls
- [Phase 03-04]: BullMQ WorkerOptions does not accept defaultJobOptions or removeOnFail: false (boolean) — retry options set per-job via createRetryJobOptions(); worker omits removeOnFail (BullMQ default keeps all failed jobs)
- [Phase 03-04]: isTransientError() is conservative — unknown errors return false (no retry) to prevent infinite retry loops on unexpected failures
- [Phase 03-04]: upsertJobScheduler() is idempotent — same schedulerId updates schedule in place, safe to call at every agent startup

### Pending Todos

None.

### Blockers/Concerns

- Research flags Phase 4 (Wallet) signing service architecture as needing deeper research during planning
- Research flags Phase 7 (Strategy Engine) as LOW confidence frontier territory
- Research flags Phase 8 (Self-Extension) code sandbox safety as needing research
- REQUIREMENTS.md states 82 total requirements but actual count is 91; traceability table corrected

## Session Continuity

Last session: 2026-02-18
Stopped at: Completed 03-04 (BullMQ retry config, DLQ, exponential backoff, cron scheduler)
Resume file: .planning/phases/03-autonomous-loop/03-05-PLAN.md
