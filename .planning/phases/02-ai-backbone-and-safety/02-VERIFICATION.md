---
phase: 02-ai-backbone-and-safety
verified: 2026-02-18T00:00:00Z
status: passed
score: 15/15 must-haves verified
re_verification: false
---

# Phase 2: AI Backbone and Safety Verification Report

**Phase Goal:** The agent can think using multiple AI models routed by task type, every action is gated by the kill switch, and all operating costs are tracked from the first API call
**Verified:** 2026-02-18
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

All truths are sourced from must_haves frontmatter across the three plans (02-01, 02-02, 02-03).

#### Plan 02-01 Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | ModelRouter resolves tier names (strong/mid/cheap) to concrete OpenRouter model IDs | VERIFIED | `router.ts` line 39: `const modelId = this.config[tier]` — config maps tier string to model ID string from env vars via `loadModelConfig()` |
| 2 | Every AI completion call is logged to ai_calls table with model, tier, tokens, and cost | VERIFIED | `router.ts` lines 47-54: `db.insert(aiCalls).values({ model, tier, promptTokens, completionTokens, costUsd })` — all required fields present |
| 3 | KillSwitchGuard reads kill switch state from agent_state table and caches it for 1 second | VERIFIED | `kill-switch.ts` lines 29-44: cache check `now < this.cachedState.expiresAt`, DB query via `agentState` where `key = 'kill_switch'`, TTL_MS = 1000 |
| 4 | ModelRouter calls KillSwitchGuard.assertActive() before dispatching any AI call | VERIFIED | `router.ts` line 36: `await this.killSwitch.assertActive()` — first line of `complete()`, before model resolution |
| 5 | OpenRouterProvider uses the openai SDK pointed at https://openrouter.ai/api/v1 | VERIFIED | `openrouter.ts` line 14: `baseURL: 'https://openrouter.ai/api/v1'` in OpenAI constructor |
| 6 | Adding a new provider means implementing AiProvider interface — no router changes needed | VERIFIED | `provider.ts` defines `AiProvider` interface with single `complete()` method; `OpenRouterProvider implements AiProvider`; router accepts `AiProvider` type |

#### Plan 02-02 Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 7 | Operator can run 'jarvis kill <reason>' from CLI and the kill switch is activated in the database | VERIFIED | `apps/cli/src/commands/kill.ts`: calls `activateKillSwitch(db, reason, 'cli')` which upserts `agent_state` key='kill_switch' with `{ active: true }` |
| 8 | Operator can run 'jarvis resume <reason>' from CLI and the kill switch is deactivated | VERIFIED | `apps/cli/src/commands/resume.ts`: calls `deactivateKillSwitch(db, reason, 'cli')` which upserts `agent_state` key='kill_switch' with `{ active: false }` |
| 9 | Every kill switch activation/deactivation is recorded in kill_switch_audit with reason and triggeredBy | VERIFIED | `kill-switch.ts` lines 100-104 (activate) and 140-144 (deactivate): `db.insert(killSwitchAudit).values({ action, reason, triggeredBy })` |
| 10 | Every tool call is checked against the kill switch before execution — blocked if active | VERIFIED | `invoke-safe.ts` line 43: `await guard.assertActive()` executes before `invokeWithLogging()`; worker uses `invokeWithKillCheck` (worker.ts line 38) |
| 11 | Agent process wires KillSwitchGuard and ModelRouter at startup | VERIFIED | `apps/agent/src/index.ts` lines 48-50: `new KillSwitchGuard(db)`, `loadModelConfig()`, `createRouter(db, OPENROUTER_API_KEY)` — all created at startup |

#### Plan 02-03 Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 12 | CreditMonitor polls OpenRouter /api/v1/key to get remaining credit balance | VERIFIED | `cost-monitor.ts` line 70: `fetch('https://openrouter.ai/api/v1/key', ...)` with Bearer token auth; parses `data.limit_remaining` |
| 13 | When credits drop below threshold ($5), Discord DM is sent to operator | VERIFIED | `cost-monitor.ts` lines 97-122: threshold check with 1-hour debounce; calls `sendOperatorDm()` with remaining balance message |
| 14 | P&L is queryable as a SQL view over operating_costs and revenue tables | VERIFIED | `pnl-view.ts`: `getPnl()` queries both `operatingCosts` and `revenue` tables with `coalesce(sum(...), '0')` pattern; returns `PnlSummary` |
| 15 | Agent can query its own AI spend from ai_calls to inform planning decisions | VERIFIED | `pnl-view.ts`: `getAiSpendSummary()` queries `aiCalls` with total cost, total calls, and per-tier breakdown |

**Score: 15/15 truths verified**

---

### Required Artifacts

#### Plan 02-01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/db/src/schema/ai-calls.ts` | ai_calls table for per-call AI usage logging | VERIFIED | `pgTable('ai_calls'` — model, tier, promptTokens, completionTokens, costUsd (numeric 12,8), goalId, createdAt |
| `packages/db/src/schema/operating-costs.ts` | operating_costs table with cost_category enum | VERIFIED | `pgTable('operating_costs'` — pgEnum cost_category with 4 values, amountUsd numeric |
| `packages/db/src/schema/revenue.ts` | revenue table for strategy P&L tracking | VERIFIED | `pgTable('revenue'` — strategyId, sourceAttribution, amountUsd numeric, earnedAt, createdAt |
| `packages/db/src/schema/kill-switch-audit.ts` | kill_switch_audit table for audit history | VERIFIED | `pgTable('kill_switch_audit'` — action, reason, triggeredBy, createdAt |
| `packages/ai/src/provider.ts` | AiProvider interface and Completion types | VERIFIED | Exports AiProvider, CompletionRequest, CompletionResponse, CompletionUsage — pure interfaces, no runtime deps |
| `packages/ai/src/openrouter.ts` | OpenRouterProvider implementing AiProvider | VERIFIED | `class OpenRouterProvider implements AiProvider` — openai SDK, OpenRouter baseURL, cost extraction cast |
| `packages/ai/src/router.ts` | ModelRouter with tier resolution, kill switch, logging | VERIFIED | Exports ModelRouter, complete() method has kill switch check, tier resolution, ai_calls insert |
| `packages/ai/src/kill-switch.ts` | KillSwitchGuard with 1-second DB cache | VERIFIED | Exports KillSwitchGuard (TTL_MS=1000, isActive, assertActive, clearCache) and KillSwitchActiveError |
| `packages/ai/src/config.ts` | ModelTierConfig and Zod-validated config loader | VERIFIED | Exports ModelTierConfig, Tier, modelTierConfigSchema, loadModelConfig() — env var with defaults |

#### Plan 02-02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/cli/src/index.ts` | Commander-based CLI entry point | VERIFIED | `commander` imported, shebang, addCommand(killCommand), addCommand(resumeCommand) |
| `apps/cli/src/commands/kill.ts` | jarvis kill command | VERIFIED | Contains `kill_switch` (via activateKillSwitch), writes to agent_state, inserts audit record |
| `apps/cli/src/commands/resume.ts` | jarvis resume command | VERIFIED | Contains `kill_switch` (via deactivateKillSwitch), writes to agent_state, inserts audit record |
| `packages/tools/src/invoke-safe.ts` | invokeWithKillCheck kill switch gate | VERIFIED | `assertActive()` called before `invokeWithLogging()`; KillCheckable duck-typed interface |
| `apps/agent/src/index.ts` | Agent startup with KillSwitchGuard and ModelRouter | VERIFIED | Imports and creates KillSwitchGuard, loadModelConfig, createRouter at startup |
| `apps/agent/src/worker.ts` | BullMQ worker using invokeWithKillCheck | VERIFIED | `invokeWithKillCheck(killSwitch, registry, db, toolName, input, timeoutMs)` — replaces invokeWithLogging |

#### Plan 02-03 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/ai/src/cost-monitor.ts` | CreditMonitor with polling and low-credit detection | VERIFIED | `api/v1/key` fetch, 5-min interval, $5 threshold, 1-hour debounce, sendOperatorDm call |
| `packages/ai/src/discord.ts` | sendOperatorDm for Discord DM notifications | VERIFIED | `discord.js` imported, Partials.Channel present, short-lived client (login/send/destroy) |
| `packages/db/src/schema/pnl-view.ts` | P&L query functions | VERIFIED | Exports getPnl, getOperatingCostTotal, getRevenueTotal, getAiSpendSummary |

---

### Key Link Verification

#### Plan 02-01 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/ai/src/router.ts` | `packages/ai/src/kill-switch.ts` | `this.killSwitch.assertActive()` | WIRED | Line 36 of router.ts — first statement in `complete()` |
| `packages/ai/src/router.ts` | `packages/ai/src/provider.ts` | `this.provider.complete(req)` | WIRED | Line 43 of router.ts — after kill switch check and model resolution |
| `packages/ai/src/router.ts` | `packages/db/src/schema/ai-calls.ts` | `insert into aiCalls after each completion` | WIRED | Lines 47-54 of router.ts — aiCalls imported from @jarvis/db, insert with all required fields |
| `packages/ai/src/kill-switch.ts` | `packages/db/src/schema/agent-state.ts` | `query agentState where key = 'kill_switch'` | WIRED | Line 36 of kill-switch.ts — `eq(agentState.key, 'kill_switch')` |
| `packages/ai/src/openrouter.ts` | openai SDK | `new OpenAI({ baseURL: 'https://openrouter.ai/api/v1' })` | WIRED | Line 14 of openrouter.ts |

#### Plan 02-02 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `apps/cli/src/commands/kill.ts` | `packages/db/src/schema/agent-state.ts` | upsert kill_switch with active=true | WIRED | Delegates to activateKillSwitch() which upserts agentState where key='kill_switch' with active=true |
| `apps/cli/src/commands/kill.ts` | `packages/db/src/schema/kill-switch-audit.ts` | insert with action='activate' | WIRED | activateKillSwitch() inserts killSwitchAudit with action='activate' |
| `apps/cli/src/commands/resume.ts` | `packages/db/src/schema/kill-switch-audit.ts` | insert with action='deactivate' | WIRED | deactivateKillSwitch() inserts killSwitchAudit with action='deactivate' |
| `packages/tools/src/invoke-safe.ts` | `packages/ai/src/kill-switch.ts` | `guard.assertActive()` before invokeWithLogging | WIRED | Line 43 of invoke-safe.ts — assertActive() called before invokeWithLogging() on line 45 |
| `apps/agent/src/worker.ts` | `packages/tools/src/invoke-safe.ts` | worker calls invokeWithKillCheck | WIRED | Line 38 of worker.ts — invokeWithKillCheck replaces invokeWithLogging |
| `apps/agent/src/index.ts` | `packages/ai/src/index.ts` | import createRouter, KillSwitchGuard from @jarvis/ai | WIRED | Line 4 of agent/index.ts |

#### Plan 02-03 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/ai/src/cost-monitor.ts` | https://openrouter.ai/api/v1/key | fetch with Authorization header | WIRED | Line 70 of cost-monitor.ts — `fetch('https://openrouter.ai/api/v1/key', { headers: { Authorization: Bearer ... } })` |
| `packages/ai/src/cost-monitor.ts` | `packages/ai/src/discord.ts` | sendOperatorDm when credits below threshold | WIRED | Line 111 of cost-monitor.ts — `sendOperatorDm(token, userId, message)` inside debounce guard |
| `packages/db/src/schema/pnl-view.ts` | `packages/db/src/schema/operating-costs.ts` | SUM query over operating_costs.amount_usd | WIRED | Line 42 of pnl-view.ts — `coalesce(sum(${operatingCosts.amountUsd}), '0')` |
| `packages/db/src/schema/pnl-view.ts` | `packages/db/src/schema/revenue.ts` | SUM query over revenue.amount_usd | WIRED | Line 55 of pnl-view.ts — `coalesce(sum(${revenue.amountUsd}), '0')` |

---

### Requirements Coverage

All 15 requirement IDs declared across the three plans are accounted for.

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MODL-01 | 02-01 | Agent routes LLM calls to different models based on task type | SATISFIED | ModelRouter.complete(messages, tier) resolves tier to model ID via config[tier] |
| MODL-02 | 02-01 | Each model call logs model used, input tokens, output tokens, and estimated cost | SATISFIED | router.ts inserts to ai_calls with model, tier, promptTokens, completionTokens, costUsd |
| MODL-03 | 02-01 | Complex reasoning tasks route to high-capability models | SATISFIED | config.ts defaults: strong='anthropic/claude-opus-4.6', mid='anthropic/claude-sonnet-4.5'; callers pass tier='strong' for complex tasks |
| MODL-04 | 02-01 | Simple tasks route to cheap models | SATISFIED | config.ts defaults: cheap='x-ai/grok-4.1-fast'; callers pass tier='cheap' for simple tasks |
| MODL-05 | 02-01 | Router supports adding new model providers without core changes | SATISFIED | AiProvider interface with single complete() method; router accepts AiProvider type — new provider = implement interface |
| KILL-01 | 02-01, 02-02 | Operator can activate kill switch via dashboard or direct database flag | SATISFIED | CLI kill/resume commands via activateKillSwitch/deactivateKillSwitch write directly to agent_state in Postgres |
| KILL-02 | 02-01 | Agent checks kill switch at start of each planning cycle | SATISFIED | ModelRouter.complete() calls assertActive() as first operation before any AI dispatch |
| KILL-03 | 02-02 | When kill switch is active, agent halts all tool execution immediately | SATISFIED | invokeWithKillCheck calls assertActive() before any tool execution; BullMQ worker uses invokeWithKillCheck |
| KILL-04 | 02-01 | Kill switch state persists across agent restarts | SATISFIED | Kill switch stored in agent_state Postgres table (not in-memory); KillSwitchGuard reads from DB on cache miss |
| TOOL-06 | 02-02 | Every tool call is checked against kill switch before execution | SATISFIED | invokeWithKillCheck gates all tool calls; worker.ts exclusively uses invokeWithKillCheck |
| COST-01 | 02-01 | AI model API spend is tracked per call with model, tokens, and cost | SATISFIED | ai_calls table stores model, tier, promptTokens, completionTokens, costUsd per completion |
| COST-02 | 02-03 | Total operating costs (VM, API, services) are aggregated and queryable | SATISFIED | operating_costs table with cost_category enum; getOperatingCostTotal() returns sum by category |
| COST-03 | 02-03 | Revenue is tracked per strategy with source attribution | SATISFIED | revenue table with strategyId, sourceAttribution columns; getRevenueTotal() queryable (schema-only for Phase 2) |
| COST-04 | 02-03 | P&L (revenue minus costs) is computed and available | SATISFIED | getPnl() returns PnlSummary with totalCostsUsd, totalRevenueUsd, netPnlUsd, aiInferenceCostUsd |
| COST-05 | 02-03 | Agent can query its own P&L to inform planning decisions | SATISFIED | getAiSpendSummary() returns total AI cost, total calls, and per-tier breakdown from ai_calls |

No orphaned requirements: all 15 IDs declared in plan frontmatter are accounted for, and the REQUIREMENTS.md tracking table marks all 15 as Phase 2 Complete.

---

### Anti-Patterns Found

No anti-patterns detected across all phase 2 files.

Scanned:
- `packages/ai/src/` (all 7 source files)
- `packages/db/src/schema/ai-calls.ts`, `operating-costs.ts`, `revenue.ts`, `kill-switch-audit.ts`, `pnl-view.ts`
- `apps/cli/src/` (index.ts, commands/kill.ts, commands/resume.ts)
- `packages/tools/src/invoke-safe.ts`
- `apps/agent/src/worker.ts`, `apps/agent/src/index.ts`

One notable pattern that is intentional, not a gap: `void killSwitch` and `void router` in `apps/agent/src/index.ts` lines 92-93. These suppress unused-variable warnings for components wired at startup but not yet consumed (the planning loop that uses them is Phase 3). The wiring is real — the objects are constructed and ready.

---

### Human Verification Required

#### 1. CreditMonitor Low-Credit Alert End-to-End

**Test:** Set `OPENROUTER_API_KEY` to an account with less than $5 remaining, instantiate `CreditMonitor`, call `recordBalance()`, observe Discord DM receipt
**Expected:** Discord DM arrives in operator's DM channel within seconds of balance check
**Why human:** Requires live OpenRouter account with low balance and a configured Discord bot; network and Discord API state cannot be verified programmatically

#### 2. Kill Switch Blocks Live Agent Under Load

**Test:** Start the agent worker, enqueue a tool-execution job, activate kill switch via `jarvis kill "test"`, enqueue another job
**Expected:** Second job throws KillSwitchActiveError and does not execute; first job completes normally
**Why human:** BullMQ job lifecycle requires running Redis, live worker, and timing-sensitive kill switch activation; cannot verify job-level blocking behavior statically

---

### Build Verification

All 5 packages build cleanly with zero TypeScript errors:

- `@jarvis/db` — `tsc` exits 0
- `@jarvis/ai` — `tsc` exits 0
- `@jarvis/tools` — `tsc` exits 0
- `@jarvis/cli` — `tsc` exits 0
- `@jarvis/agent` — `tsc` exits 0

### Database Verification

All 4 new tables confirmed present in Postgres (verified via `\dt`):

- `ai_calls` — AI call logging (MODL-02, COST-01)
- `operating_costs` — Operating cost tracking (COST-02)
- `revenue` — Revenue schema (COST-03)
- `kill_switch_audit` — Kill switch audit trail (KILL-01)

### Isolation Verification

No direct `drizzle-orm` imports in `packages/ai/src/` — all ORM access goes through `@jarvis/db` re-exports. The dependency graph is clean: `cli -> ai -> db`, `tools -> db`, `agent -> ai -> db`, `agent -> tools -> db`.

---

## Gaps Summary

No gaps. All automated checks passed. The phase goal is fully achieved:

- **"The agent can think using multiple AI models routed by task type"** — ModelRouter with three tiers (strong/mid/cheap) maps to concrete OpenRouter model IDs, dispatches via AiProvider interface.
- **"Every action is gated by the kill switch"** — assertActive() in ModelRouter (AI calls) and invokeWithKillCheck in the BullMQ worker (tool calls) form a complete gate; the DB-flag pattern survives restarts.
- **"All operating costs are tracked from the first API call"** — ai_calls table records every completion; operating_costs and revenue tables enable P&L; CreditMonitor watches remaining credit balance.

---

_Verified: 2026-02-18_
_Verifier: Claude (gsd-verifier)_
