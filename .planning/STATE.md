# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core value:** The agent must be able to autonomously reason about opportunities, acquire the tools and accounts it needs, and execute money-making strategies without human intervention.
**Current focus:** Phase 6: Browser Identity and Bootstrapping — IN PROGRESS (3/4 plans done)

## Current Position

Phase: 6 of 8 (Browser Identity and Bootstrapping) — IN PROGRESS
Plan: 3 of 4 in current phase (06-03 complete — 8 browser automation ToolDefinitions via createBrowserTools factory)
Status: In progress
Last activity: 2026-02-19 — Completed 06-03 (browser_navigate, browser_click/fill/extract, browser_screenshot, browser_session_open/close/save)

Progress: [████████████████████] 80%

## Performance Metrics

**Velocity:**
- Total plans completed: 15
- Average duration: 3.8 min
- Total execution time: 0.83 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-infrastructure | 4/4 | 26 min | 6.5 min |
| 02-ai-backbone-and-safety | 3/3 | 9 min | 3 min |
| 03-autonomous-loop | 6/6 | 20 min | 3.3 min |
| 04-wallet-and-financial-governance | 4/4 | 28 min | 7 min |
| 05-web-dashboard | 3/3 | 14 min | 4.7 min |
| 06-browser-identity-and-bootstrapping | 3/4 | 11 min | 5.5 min |

**Recent Trend:**
- Last 5 plans: 05-02 (5 min), 05-03 (5 min), 06-01 (8 min), 06-03 (3 min)
- Trend: Phase 6 in progress; 06-03 browser tools plan completed in 3 min

*Updated after each plan completion*
| Phase 02-ai-backbone-and-safety P02 | 4 | 2 tasks | 11 files |
| Phase 03-autonomous-loop P01 | 3 | 3 tasks | 8 files |
| Phase 03-autonomous-loop P04 | 3 | 2 tasks | 3 files |
| Phase 03-autonomous-loop P02 | 6 | 2 tasks | 6 files |
| Phase 03-autonomous-loop P03 | 6 | 2 tasks | 3 files |
| Phase 03-autonomous-loop P05 | 4 | 2 tasks | 5 files |
| Phase 03-autonomous-loop P06 | 4 | 3 tasks | 5 files |
| Phase 04-wallet-and-financial-governance P01 | 8 | 2 tasks | 13 files |
| Phase 04-wallet-and-financial-governance P02 | 4 | 2 tasks | 6 files |
| Phase 04-wallet-and-financial-governance P03 | 14 | 2 tasks | 12 files |
| Phase 04-wallet-and-financial-governance P04 | 2 | 1 tasks | 1 files |
| Phase 05-web-dashboard P01 | 4 | 2 tasks | 12 files |
| Phase 05-web-dashboard P02 | 5 | 2 tasks | 14 files |
| Phase 05-web-dashboard P03 | 5 | 2 tasks | 5 files |
| Phase 06 P01 | 8 | 2 tasks | 12 files |
| Phase 06-browser-identity-and-bootstrapping P03 | 3 | 2 tasks | 8 files |

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
- [Phase 03-03]: zod added as direct dep to apps/agent — pnpm strict isolation prevents transitive zod access from @jarvis/tools
- [Phase 03-03]: ChatCompletionMessageParam sourced via ToolCompletionRequest['messages'][number] — established pattern from agent-loop.ts, avoids direct openai dep
- [Phase 03-03]: removeOnFail omitted (not false) in WorkerOptions — BullMQ v5 WorkerOptions.removeOnFail is KeepJobs|undefined, not boolean; omitting preserves DLQ jobs
- [Phase 03-03]: Sub-agents use 'mid' tier not 'strong' — focused scoped tasks don't require frontier reasoning capability
- [Phase 03-04]: BullMQ WorkerOptions does not accept defaultJobOptions or removeOnFail: false (boolean) — retry options set per-job via createRetryJobOptions(); worker omits removeOnFail (BullMQ default keeps all failed jobs)
- [Phase 03-04]: isTransientError() is conservative — unknown errors return false (no retry) to prevent infinite retry loops on unexpected failures
- [Phase 03-04]: upsertJobScheduler() is idempotent — same schedulerId updates schedule in place, safe to call at every agent startup
- [Phase 03-autonomous-loop]: ChatCompletionMessageParam extracted from ToolCompletionRequest['messages'][number] — avoids direct openai import in @jarvis/agent under pnpm strict isolation
- [Phase 03-autonomous-loop]: GoalManager.decomposeGoal uses 2-pass insert for dependsOn resolution — insert all rows first, then patch resolved IDs
- [Phase 03-autonomous-loop]: Evaluator and Replanner defined as interface stubs in Plan 02 — concrete implementations wired in Plan 05
- [Phase 03-05]: EvaluatorImpl uses metric-before-LLM evaluation — fast failure/cost triggers first, cheap LLM only if metrics pass
- [Phase 03-05]: shouldReplan accumulation — any major triggers immediately; >2 minor accumulate; >50% divergent (min 4 samples) triggers
- [Phase 03-05]: Supervisor does not decide spawn-vs-inline — LLM makes that decision via tool description (MULTI-06 fulfilled at prompt level)
- [Phase 03-05]: Discord DM for operator alerts reads DISCORD_TOKEN/DISCORD_OPERATOR_USER_ID from env vars — non-fatal if missing
- [Phase 03-06]: Journal checkpoint must succeed before next sub-goal — 3 retries then halt (not silent skip) to prevent duplicate execution on recovery
- [Phase 03-06]: clearJournal called on goal completion to prevent stale journal affecting future recovery runs
- [Phase 03-06]: LOG-05 two-row pattern applied to interrupted planning cycles — insert interrupted row, never update original active row
- [Phase 03-06]: ShutdownSupervisor duck-typed interface in shutdown.ts — avoids importing concrete Supervisor class, keeps shutdown.ts decoupled
- [Phase 04-01]: signBytes (raw byte signing) used instead of @solana/kit transaction object API — signer stays format-agnostic, returns 64-byte Ed25519 signature as base64; callers embed signature into transaction structure themselves
- [Phase 04-01]: Sub-goals co-located in goals.ts — cross-file .js imports break drizzle-kit CJS bundler (esbuild-register); sub-goals.ts becomes a re-export shim for backward compat
- [Phase 04-01]: process.send('ready') guarded by if (process.send) — allows signer to run both standalone and via child_process.fork() without IPC
- [Phase 04-wallet-and-financial-governance]: Rolling 24h window for daily aggregate spend (not calendar day) — avoids timezone ambiguity
- [Phase 04-wallet-and-financial-governance]: No active spend limit row = allow all transactions (high generous defaults per locked decision)
- [Phase 04-03]: @solana/web3.js v1 Transaction API used for SOL/SPL sends — @solana-program/system incompatible with @solana/kit@2.x; web3.js v1 already a dep
- [Phase 04-03]: Idempotent ATA creation bundled in same tx as transfer — createAssociatedTokenAccountIdempotentInstruction is no-op if ATA exists
- [Phase 04-03]: SPL token governance initially skipped — resolved by 04-04 gap closure (checkSpendLimits now enforced in sendSplToken)
- [Phase 04-03]: createRequire(import.meta.url).resolve() for signer path — ESM-compatible, resolves @jarvis/wallet/dist/signer/server.js from node_modules
- [Phase 04-03]: ShutdownSignerProcess.kill() accepts number|NodeJS.Signals|string — matches ChildProcess.kill() while staying pnpm-isolated
- [Phase 04-04]: SPL governance uses raw token base units vs lamport ceilings — coarse safety net preventing unbounded SPL sends; USD-denominated per-token limits require oracle pricing, deferred to future phase
- [Phase 05-01]: Hono app factory in app.ts, server lifecycle in index.ts — clean separation of app definition vs startup
- [Phase 05-01]: serveStatic mounted AFTER API routes — prevents /api/* requests being caught by static file handler
- [Phase 05-01]: SSE heartbeat uses event:heartbeat with empty data (not comment field) — Hono SSEMessage type has no comment field
- [Phase 05-01]: broadcaster.ts EventEmitter singleton with maxListeners=100 — central fan-out for SSE; poller emits, SSE route subscribes
- [Phase 05-01]: Poller starts immediately at startup then runs on interval — processes state from prior runs without waiting first interval
- [Phase 05-web-dashboard]: pnpm-workspace.yaml needs explicit apps/dashboard/client entry — apps/* glob only matches direct subdirectories, not nested paths
- [Phase 05-web-dashboard]: Client tsconfig uses moduleResolution:bundler not NodeNext — Vite handles module resolution, NodeNext causes TS errors
- [Phase 05-web-dashboard]: SSE + polling dual-track: fetchEventSource calls setQueryData for immediate push; useQuery polls as fallback
- [Phase 06-01]: All 4 identity/credential tables co-located in identities.ts — drizzle-kit CJS bundler cannot resolve .js cross-file FK imports
- [Phase 06-01]: customType bytea for encryptedValue — pgcrypto pgp_sym_encrypt returns raw binary; text column would corrupt it
- [Phase 06-01]: BrowserManager is NOT a singleton — caller manages lifecycle for flexibility
- [Phase 06-01]: playwright-extra uses cloudflareTurnstile not turnstile method name in @2captcha/captcha-solver v1.3.2
- [Phase 06]: playwright added as direct dep to @jarvis/tools — pnpm strict isolation requires direct deps for Page type imports
- [Phase 06]: humanLike click uses page.mouse.move steps + random offset within bounding box — simulates natural mouse paths per locked stealth decision
- [Phase 06]: typeDelay uses page.type() for per-keystroke events (not page.fill() instantaneous) — exposes human-like typing to agent as optional capability

### Pending Todos

None.

### Blockers/Concerns

- Research flags Phase 7 (Strategy Engine) as LOW confidence frontier territory
- Research flags Phase 8 (Self-Extension) code sandbox safety as needing research
- REQUIREMENTS.md states 82 total requirements but actual count is 91; traceability table corrected

## Session Continuity

Last session: 2026-02-19
Stopped at: Completed 06-03-PLAN.md (browser automation tool group: 8 ToolDefinitions)
Resume file: .planning/phases/06-browser-identity-and-bootstrapping/06-CONTEXT.md
