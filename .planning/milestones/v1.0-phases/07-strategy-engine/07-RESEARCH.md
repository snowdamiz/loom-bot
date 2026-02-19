# Phase 7: Strategy Engine - Research

**Researched:** 2026-02-18
**Domain:** Autonomous goal-pursuit engine, strategy lifecycle management, per-strategy P&L attribution, parallel goal execution
**Confidence:** HIGH (codebase deeply understood; patterns derived from existing Phase 1-6 implementation)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**General-purpose architecture**
- Strategy engine is domain-agnostic — works for any goal type, not just revenue
- No hard-coded strategy categories or money-specific code
- The agent uses LLM reasoning to discover, evaluate, pivot, and kill strategies in real time
- Strategies emerge from the agent's own analysis of its goal, not from predefined templates

**Opportunity scope**
- Only constraint on what the agent can pursue: legality
- No allowlists, blocklists, or ethical filters beyond legal compliance
- Agent explores any legal opportunity that serves its seeded goal

**Risk appetite**
- Each main agent has its own wallet balance, seeded by the operator
- Agent has full autonomy over capital allocation — can concentrate entire balance into one strategy
- Phase 4 spend limits (per-transaction and daily caps) are the only capital guardrails — no additional strategy-level limits
- When balance gets low, agent decides autonomously whether to pause, pivot to zero-capital work, or notify operator

**Strategy evaluation**
- Agent uses LLM judgment to evaluate strategy health — no hard-coded P&L thresholds or auto-kill triggers
- No enforced limit on parallel strategies — agent decides concurrency based on its own assessment

**Operator interaction**
- Goals seeded via dashboard (natural language)
- Operator intervenes by talking to the agent via chat, not mechanical dashboard buttons
- Kill switch remains the only mechanical override
- Full reasoning logs — every strategy decision logged with complete LLM reasoning (why pursued, pivoted, killed)

**Dashboard and reporting**
- Aggregate view across all agents + drill-down per agent
- Per-strategy P&L attribution (costs + revenue) at the data model level
- Dashboard UI for viewing this data is NOT baked into Phase 7 — agent builds its own dashboard extensions via self-extension (Phase 8)

**Strategy lifecycle**
- Claude's Discretion: lifecycle state definitions and transitions — Claude determines the right level of structure for strategy states

**Capability gaps**
- When a strategy requires a capability the agent doesn't have, it builds it using Phase 8 self-extension
- Phase 7 assumes Phase 8 capabilities are available for the agent to extend itself

### Claude's Discretion

- Strategy lifecycle state definitions and transitions
- Concurrency management approach
- Internal data model for strategy tracking

### Deferred Ideas (OUT OF SCOPE)

- **Real-time chat interface** with agents (dedicated chat windows where operator can talk to any main agent, spawn new ones) — extends Phase 5 Web Dashboard or its own phase
- **Multi-agent spawning from dashboard** — operator spawns new agents from UI
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STRAT-01 | Agent discovers potential money-making opportunities via web research | Existing `http` tool + shell tool enable web scraping/API calls; LLM planner directs research sub-goals |
| STRAT-02 | Agent generates hypotheses about profitable strategies from discovered opportunities | LLM planner (`planGoalDecomposition`) already does this; extend to emit strategy records |
| STRAT-03 | Agent tests strategies with minimal capital before committing larger amounts | Phase 4 wallet tools + spend limits provide guardrails; strategy tracking schema gates progression |
| STRAT-04 | Agent evaluates strategy performance against expectations and kills underperformers | New `strategies` table + LLM evaluation loop; extend existing `EvaluatorImpl` pattern |
| STRAT-05 | Agent scales winning strategies by allocating more capital | Capital allocation is an LLM decision surfaced via strategy context in prompt; tracked in `strategies` table |
| STRAT-06 | Agent runs multiple strategies in parallel as independent goal trees | Existing `Supervisor` manages parallel `AgentLoop` instances; strategies map 1:1 to goals |
| STRAT-07 | Per-strategy P&L is tracked independently with source attribution | New `strategies` table + FK on existing `revenue` and `operating_costs` tables |
| STRAT-08 | Agent dynamically allocates capital across strategies based on performance | Strategic reallocation prompt context + `capital_allocated_usd` column on `strategies` table |
</phase_requirements>

---

## Summary

Phase 7 adds a strategy lifecycle layer on top of the already-complete autonomous goal execution engine (Phases 1-6). The core machinery — parallel goal trees via `Supervisor`, LLM-driven sub-goal decomposition via `GoalManager`/`planGoalDecomposition`, outcome evaluation via `EvaluatorImpl`, and replanning via `ReplannerImpl` — is already in production. What Phase 7 needs is: (1) a `strategies` table that makes strategies first-class tracked entities with their own lifecycle and P&L; (2) strategy-scoped context injection into the agent's planning prompts so the LLM can reason about its portfolio of strategies; and (3) attribution FKs wired into the existing `revenue` and `operating_costs` tables so P&L can be sliced per strategy.

The architecture decision is that a "strategy" is a long-lived goal with extra metadata: its lifecycle state, capital allocated, hypothesis text, and P&L attribution. Each strategy maps 1:1 to a goal row. The Supervisor already runs parallel goals; Phase 7 just makes strategies visible as first-class entities rather than raw goals. The agent seeds strategies autonomously by creating goals with strategy metadata, evaluates them via the existing evaluator loop augmented with P&L context, and kills/pivots them by updating strategy status and replanning.

The most significant new work is the `strategies` schema (with lifecycle state machine and P&L fields), attribution wiring on `operating_costs` and `revenue`, and an enhanced planning prompt that surfaces the full strategy portfolio so the LLM can make portfolio-level decisions (scale winners, kill losers, discover new opportunities).

**Primary recommendation:** Model strategies as a thin metadata layer on top of existing goals. Add a `strategies` table referencing `goals.id`, carry `strategyId` on `revenue` and `operating_costs`, and inject strategy portfolio context into every planning cycle prompt. Let the LLM do all evaluation, allocation, and lifecycle transitions using its existing tool access. Do not build a separate strategy executor — the current `AgentLoop` already is the executor.

---

## Standard Stack

### Core (all already in use — no new dependencies needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `drizzle-orm` | `^0.40.0` | ORM for new `strategies` schema | Already the project ORM; consistent with all existing tables |
| `drizzle-kit` | `^0.30.4` | Schema migrations | Already in use for `db:push` / `db:generate` |
| `@jarvis/ai` (ModelRouter) | workspace | LLM calls for evaluation, discovery, allocation | Already wired into every planning loop |
| `@jarvis/tools` (ToolRegistry) | workspace | Shell/HTTP tools for web research | Already registered; `http` and `shell` tools handle web access |
| BullMQ | `^5.34.8` | Parallel strategy execution via existing Supervisor | Already manages parallel goal loops |
| `bullmq` FlowProducer | `^5.34.8` | Optional: parent-child job hierarchies for strategy phases | Already available; use if sub-strategy decomposition is needed |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | `^3.25.76` | Schema validation for LLM JSON responses | Already used; validate strategy hypothesis and evaluation JSON |
| `pg` numeric | n/a | Exact decimal for P&L amounts | Already used in `revenue` and `operating_costs` — continue same pattern |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Goals-as-strategies mapping | Separate strategy executor | Goals-as-strategies reuses all existing machinery; no duplication |
| LLM-driven lifecycle transitions | Hard-coded thresholds | CONTEXT.md explicitly locks LLM judgment; no hard triggers allowed |
| Extending `revenue`/`operating_costs` FKs | Separate strategy P&L table | Extension is simpler and doesn't break existing aggregation queries |

**Installation:** No new packages needed. Phase 7 is entirely additive to existing schema and prompt engineering.

---

## Architecture Patterns

### Recommended Project Structure

```
packages/db/src/schema/
├── strategies.ts            # NEW: strategies table (lifecycle, capital, hypothesis)
├── goals.ts                 # EXISTING: add strategyId FK (nullable, backfill optional)
├── revenue.ts               # EXISTING: strategyId already present as text — normalize to FK
├── operating-costs.ts       # EXISTING: add strategyId FK (nullable)
├── pnl-view.ts              # EXISTING: extend getPnl() to accept strategyId filter

apps/agent/src/
├── loop/
│   ├── goal-manager.ts      # EXISTING: add createGoalWithStrategy(), getStrategyContext()
│   ├── agent-loop.ts        # EXISTING: inject strategy portfolio context into system prompt
│   ├── planner.ts           # EXISTING: extend planGoalDecomposition() to include strategy portfolio
│   └── evaluator.ts         # EXISTING: EvaluatorImpl already suitable; augment with P&L check
├── strategy/
│   ├── strategy-manager.ts  # NEW: CRUD for strategies table, getPortfolioContext()
│   └── strategy-prompts.ts  # NEW: portfolio summary prompt builder for LLM context injection
└── index.ts                 # EXISTING: wire StrategyManager at startup
```

### Pattern 1: Strategy as Goal Metadata

**What:** A "strategy" is a goal row with an associated `strategies` row that carries lifecycle state, capital allocation, hypothesis text, and P&L attribution context. The strategy's execution IS the goal's AgentLoop — no separate executor needed.

**When to use:** Always. This is the only approach consistent with the existing architecture.

**Example:**
```typescript
// packages/db/src/schema/strategies.ts

import { integer, jsonb, numeric, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { goals } from './goals.js';

/**
 * STRAT-01 through STRAT-08: Strategy lifecycle tracking.
 *
 * A strategy is a long-lived goal pursuit with explicit lifecycle management
 * and per-strategy P&L attribution. Each strategy maps 1:1 to a goal row.
 *
 * Lifecycle states (Claude's Discretion):
 *   hypothesis  → Initial idea, not yet tested with capital
 *   testing     → Minimal capital committed; evaluating feasibility
 *   scaling     → Proven profitable; increasing capital allocation
 *   paused      → Temporarily halted (low balance, operator request, or self-assessment)
 *   killed      → Permanently terminated; capital freed
 *   completed   → Goal achieved (for finite goals like "earn $X")
 */
export const strategies = pgTable('strategies', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  /** 1:1 with goals.id — the goal this strategy executes */
  goalId: integer('goal_id').references(() => goals.id).notNull(),
  /** LLM-generated hypothesis: what this strategy is and why it will work */
  hypothesis: text('hypothesis').notNull(),
  /** Current lifecycle state */
  status: varchar('status', { length: 32 }).notNull().default('hypothesis'),
  /** USD equivalent of capital currently allocated to this strategy */
  capitalAllocatedUsd: numeric('capital_allocated_usd', { precision: 12, scale: 4 }).notNull().default('0'),
  /** LLM-supplied reasoning for the most recent lifecycle transition */
  lastTransitionReason: text('last_transition_reason'),
  /** Free-form metadata: LLM can store strategy-specific context (e.g., platform, approach) */
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type Strategy = typeof strategies.$inferSelect;
export type NewStrategy = typeof strategies.$inferInsert;
```

### Pattern 2: Strategy Portfolio Context Injection

**What:** Before each planning cycle, the agent receives a structured summary of its entire strategy portfolio (all strategies with their status, P&L, and capital). This gives the LLM the information it needs to make portfolio-level decisions.

**When to use:** Inject into every `AgentLoop.executeSubGoal()` system prompt when the agent is operating in strategy mode (i.e., has a seeded long-lived goal).

**Example:**
```typescript
// apps/agent/src/strategy/strategy-prompts.ts

export function buildPortfolioContextPrompt(strategies: StrategyWithPnl[]): string {
  if (strategies.length === 0) {
    return 'STRATEGY PORTFOLIO: Empty. No strategies active. Discover new opportunities.';
  }

  const lines = strategies.map((s) => [
    `  [${s.id}] ${s.status.toUpperCase()}: ${s.hypothesis.slice(0, 120)}`,
    `       Capital: $${s.capitalAllocatedUsd} | Net P&L: $${s.netPnlUsd.toFixed(4)}`,
    `       Goal #${s.goalId}`,
  ].join('\n'));

  return [
    'STRATEGY PORTFOLIO:',
    ...lines,
    '',
    'Use this context to:',
    '- Scale winners (move more capital to high-P&L strategies)',
    '- Kill losers (mark failed strategies as killed, free capital)',
    '- Discover new opportunities when capital is idle',
    '- Pivot strategies that are not working',
  ].join('\n');
}
```

### Pattern 3: Attribution FK Wiring

**What:** Both `revenue` and `operating_costs` already have a `strategyId` text field. For Phase 7, add a proper FK reference to `strategies.id` (or keep as text and enforce via application). The existing `getPnl()` function in `pnl-view.ts` already accepts `strategyId` — just wire the actual ID.

**When to use:** Every time a wallet transaction, API cost, or revenue event occurs during strategy execution, the agent tool invocation must include `strategyId` in the attribution.

**Example:**
```typescript
// Extend operating-costs schema to reference strategies
// packages/db/src/schema/operating-costs.ts — ADD strategyId column

strategyId: integer('strategy_id').references(() => strategies.id),

// Then in pnl-view.ts, the existing getRevenueTotal(db, strategyId) just works.
// getOperatingCostTotal needs same extension.
```

### Pattern 4: LLM-Driven Lifecycle Transitions

**What:** The agent transitions strategies between lifecycle states by calling a `db` tool to update `strategies.status`. The decision is made by the LLM during its regular sub-goal execution, not by any hard-coded trigger. The reasoning is logged to `decision_log`.

**When to use:** Always. CONTEXT.md locks this: no hard-coded thresholds.

**Example agent reasoning flow:**
```
1. Agent receives portfolio context in system prompt (all strategy statuses + P&L)
2. Agent executes current sub-goal
3. Evaluator checks outcome (existing EvaluatorImpl)
4. If P&L data warrants review, agent calls db tool:
   UPDATE strategies SET status='killed', last_transition_reason='Net P&L -$12 after 3 days testing. No viable path to profit.' WHERE id=42;
5. Decision logged to decision_log with full reasoning chain
6. Capital freed: agent updates capitalAllocatedUsd to 0
```

### Pattern 5: Opportunity Discovery via Research Sub-Goal

**What:** The agent's planner decomposes "find new opportunities" as a research sub-goal, using the `http` tool (for APIs and web requests) and `shell` tool (for running scrapers). Results feed into creating new strategy hypotheses.

**When to use:** When the portfolio context shows idle capital or all strategies are underperforming.

**Example sub-goal:**
```
Sub-goal: "Research current opportunities for passive income that require <$50 capital.
Use http tool to query relevant APIs and websites. Return a structured list of 3-5
opportunities with estimated effort, capital required, and earning potential."
```

### Anti-Patterns to Avoid

- **Hard-coded kill thresholds:** Do not build an auto-kill trigger based on P&L numbers. The LLM evaluates and decides.
- **Strategy-specific tool creation:** Do not build new tools for "strategy management." Use the existing `db` tool — the agent SQL queries the `strategies` table directly.
- **Separate strategy executor:** Do not create a new execution loop. `AgentLoop` already IS the executor; strategy is just metadata on the goal.
- **Over-decomposing strategy lifecycle:** Keep the state machine simple (6 states max). Over-engineering here creates maintenance burden with no value.
- **Blocking parallel strategies:** Do not serialize strategy execution. The existing `Supervisor` runs goals in parallel — this is already correct.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parallel strategy execution | Custom strategy runner | Existing `Supervisor` + `AgentLoop` | Already handles concurrency, crash recovery, kill switch |
| Web research for opportunities | Custom scraper | `http` tool + `shell` tool | Already registered, already handles cookies/sessions |
| Strategy P&L queries | Custom aggregator | Extend existing `getPnl()` in `pnl-view.ts` | Already handles date ranges; just add `strategyId` filter |
| LLM evaluation of strategy health | Custom scoring system | Extend existing `EvaluatorImpl` | Already does dual-path (metric + LLM) evaluation |
| Capital allocation decisions | Custom optimizer | LLM reasoning via portfolio context prompt | Architecture locks LLM judgment — don't build heuristics |
| Decision audit trail | Custom logger | Existing `decision_log` table | Already stores JSONB reasoning chains |
| Strategy state persistence | In-memory state | New `strategies` table in Postgres | Must survive crashes; same pattern as all other state |

**Key insight:** The entire execution engine already exists. Phase 7 is 80% schema and prompt engineering, 20% new code.

---

## Common Pitfalls

### Pitfall 1: Treating Strategies as Separate from Goals
**What goes wrong:** Building a parallel "strategy executor" instead of leveraging the existing `AgentLoop`. Results in duplicated code, two sources of truth, and conflicts with the kill switch / recovery system.
**Why it happens:** The word "strategy engine" implies a separate engine.
**How to avoid:** A strategy IS a goal with metadata. The `strategies` table just adds lifecycle state and P&L fields to an existing goal.
**Warning signs:** Any new executor class, any new BullMQ queue just for strategies, any code that bypasses `GoalManager`.

### Pitfall 2: Adding Strategy-Level Spend Limits
**What goes wrong:** Adding per-strategy capital caps or kill thresholds to the database schema. CONTEXT.md explicitly locks this out — only Phase 4 spend limits apply.
**Why it happens:** Natural instinct to add guardrails at every level.
**How to avoid:** The `capitalAllocatedUsd` field on `strategies` is informational (for LLM context), not enforced. Never add a CHECK constraint or application-level block on it.
**Warning signs:** Any `if capitalAllocated > threshold` in application code.

### Pitfall 3: Breaking the Append-Only Log Pattern
**What goes wrong:** Using UPDATE on `decision_log` or `planning_cycles` to record strategy transitions. Prior phases established these as append-only.
**Why it happens:** Strategy lifecycle transitions feel like updates to existing records.
**How to avoid:** The `strategies` table itself CAN be updated (it's a living registry). Log transitions to `decision_log` with new INSERT rows. Never update existing `decision_log` rows.
**Warning signs:** Any `.update()` call targeting `decision_log` or `planning_cycles`.

### Pitfall 4: Missing strategyId on Cost Attribution
**What goes wrong:** Operating costs incurred during strategy execution are recorded without `strategyId`, making per-strategy P&L impossible to compute.
**Why it happens:** The existing `operating_costs` table doesn't have `strategyId`; developers forget to add it.
**How to avoid:** Add `strategyId` FK to `operating_costs` in Phase 7 schema migration. Agent tools that log costs must receive and pass `strategyId` as context.
**Warning signs:** `getPnl(db, { strategyId: 'x' })` returns zero costs even when strategy has been running.

### Pitfall 5: Context Window Overflow from Portfolio Summary
**What goes wrong:** Injecting the full strategy portfolio (all history, all sub-goals, all P&L details) into every sub-goal prompt blows the context window.
**Why it happens:** Portfolio grows over time; naive injection of everything.
**How to avoid:** Portfolio context prompt is a compact summary (one line per strategy). Full history is available via `db` tool when needed. Keep portfolio summary under 500 tokens.
**Warning signs:** `context_length_exceeded` finish_reason appearing more frequently after strategy count grows.

### Pitfall 6: Forgetting That revenue.strategyId is Currently Text
**What goes wrong:** Existing `revenue.strategyId` is `text`, not an FK to `strategies.id`. Writing queries that join `revenue.strategyId` against `strategies.id` (integer) causes type mismatch.
**Why it happens:** Schema was stubbed in Phase 4 with `text` before `strategies` table existed.
**How to avoid:** Phase 7 schema migration must change `revenue.strategyId` to `integer` FK OR keep as text and cast in queries. Integer FK is cleaner and allows referential integrity.
**Warning signs:** `operator does not exist: integer = text` Postgres errors.

---

## Code Examples

### Creating a Strategy with Associated Goal

```typescript
// Source: derived from existing GoalManager.createGoal() pattern in apps/agent/src/loop/goal-manager.ts

// apps/agent/src/strategy/strategy-manager.ts
export class StrategyManager {
  constructor(
    private readonly db: DbClient,
    private readonly goalManager: GoalManager,
  ) {}

  async createStrategy(
    hypothesis: string,
    capitalAllocatedUsd: number = 0,
    metadata?: Record<string, unknown>,
  ): Promise<{ strategy: Strategy; goal: Goal }> {
    // 1. Create the parent goal — this is what AgentLoop executes
    const goal = await this.goalManager.createGoal(
      `Strategy: ${hypothesis}`,
      'agent-discovered',
      50,
    );

    // 2. Create the strategy metadata row
    const [strategy] = await this.db
      .insert(strategies)
      .values({
        goalId: goal.id,
        hypothesis,
        status: 'hypothesis',
        capitalAllocatedUsd: capitalAllocatedUsd.toString(),
        metadata: metadata ?? null,
      })
      .returning();

    return { strategy, goal };
  }

  async getPortfolioContext(includeKilled = false): Promise<StrategyWithPnl[]> {
    // Fetch all strategies + their P&L via pnl-view helpers
    const rows = await this.db.select().from(strategies)
      .where(includeKilled ? undefined : not(eq(strategies.status, 'killed')))
      .orderBy(asc(strategies.createdAt));

    return Promise.all(rows.map(async (s) => {
      const pnl = await getPnl(this.db, { strategyId: s.id });
      return { ...s, netPnlUsd: pnl.netPnlUsd, totalCostsUsd: pnl.totalCostsUsd };
    }));
  }

  async transitionStatus(
    strategyId: number,
    newStatus: string,
    reason: string,
  ): Promise<void> {
    await this.db
      .update(strategies)
      .set({ status: newStatus, lastTransitionReason: reason, updatedAt: new Date() })
      .where(eq(strategies.id, strategyId));
  }
}
```

### Extended getPnl() with strategyId

```typescript
// Source: derived from packages/db/src/schema/pnl-view.ts existing pattern

// Add strategyId parameter to existing getPnl function
export async function getPnl(
  db: DbClient,
  options?: { since?: Date; until?: Date; strategyId?: number },
): Promise<PnlSummary> {
  const { since, until, strategyId } = options ?? {};

  const costConditions = [];
  if (since) costConditions.push(gte(operatingCosts.periodStart, since));
  if (until) costConditions.push(lte(operatingCosts.periodEnd, until));
  if (strategyId) costConditions.push(eq(operatingCosts.strategyId, strategyId));

  const revenueConditions = [];
  if (since) revenueConditions.push(gte(revenue.earnedAt, since));
  if (until) revenueConditions.push(lte(revenue.earnedAt, until));
  if (strategyId) revenueConditions.push(eq(revenue.strategyId, strategyId));

  // ... rest of existing query unchanged
}
```

### Strategy Portfolio Context in Planning Prompt

```typescript
// Source: derived from apps/agent/src/loop/agent-loop.ts executeSubGoal() pattern

// Inject into AgentLoop.executeSubGoal() system prompt when strategyContext is provided
const systemPromptParts = [
  'You are an autonomous AI agent executing a specific sub-goal.',
  '',
  `SUB-GOAL: ${subGoal.description}`,
  '',
];

if (strategyContext) {
  systemPromptParts.push(strategyContext, '');
}

systemPromptParts.push(
  'CONSTRAINTS:',
  '- Execute the sub-goal using the available tools.',
  // ... existing constraints
);
```

### Strategy Lifecycle State Machine (Recommended States)

```typescript
// Recommended state transitions (Claude's Discretion — this is the recommendation)
type StrategyStatus =
  | 'hypothesis'  // Created but not yet tested. No capital committed.
  | 'testing'     // Minimal capital committed. Evaluating feasibility.
  | 'scaling'     // Proven profitable. Increasing capital allocation.
  | 'paused'      // Temporarily halted. Capital frozen (not freed).
  | 'killed'      // Permanently terminated. Capital freed.
  | 'completed';  // Finite goal achieved (e.g., "earn $100"). Auto-transitions here.

// Valid transitions (LLM decides; no mechanical enforcement):
// hypothesis  → testing   (agent decides to test)
// hypothesis  → killed    (agent decides not to pursue)
// testing     → scaling   (agent assesses profitable)
// testing     → killed    (agent assesses unprofitable)
// testing     → paused    (agent needs more time/data)
// scaling     → paused    (market conditions changed)
// scaling     → killed    (performance degraded)
// scaling     → completed (finite goal reached)
// paused      → testing   (agent resumes)
// paused      → killed    (agent abandons)
// paused      → scaling   (agent resumes confident)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hard-coded strategy templates | LLM-discovered strategies from goal analysis | Phase 7 design decision | No pre-baked strategy types; true generality |
| Separate P&L tracker | Attribution FKs on existing cost/revenue tables | Phase 4 stubbed; Phase 7 completes | Single source of truth; no sync issues |
| Manual operator review gates | LLM evaluates and transitions autonomously | Locked in CONTEXT.md | Fully autonomous lifecycle; operator uses chat |
| Flat goal list | Strategy portfolio context in every prompt | Phase 7 new | LLM has full portfolio visibility for decisions |

**Deprecated/outdated:**
- Strategy templates: CONTEXT.md explicitly bans pre-defined strategy types
- Per-strategy spend limits: Only Phase 4 limits apply; strategy-level limits are out of scope

---

## Open Questions

1. **How does the agent discover the first strategy when it has no portfolio?**
   - What we know: The goal seeded by the operator IS the first strategy prompt
   - What's unclear: Does the operator seed "make money" and the agent creates strategy rows, or does the operator seed specific strategies?
   - Recommendation: Agent receives the operator's natural language goal, creates one "hypothesis" strategy, then discovers and creates more strategies autonomously. The initial seeded goal description IS the first hypothesis.

2. **How does `revenue.strategyId` migration work without breaking existing data?**
   - What we know: Existing `revenue.strategyId` is `text`, has no FK; existing data may have `strategyId = ''` or arbitrary strings
   - What's unclear: Is there existing revenue data that needs backfill?
   - Recommendation: Change column to `integer`, nullable, FK to `strategies.id`. Existing rows get `NULL`. No backfill needed for pre-strategy-engine data.

3. **How does the agent attribute costs to strategies when operating multiple strategies in parallel?**
   - What we know: `operating_costs` has no `strategyId` column yet; agent must pass `strategyId` when recording costs
   - What's unclear: How does the agent know which strategy a cost belongs to when running a shared sub-goal?
   - Recommendation: Each AgentLoop runs one goal (one strategy). `strategyId` is set at AgentLoop construction from the goal's associated strategy. All costs incurred during that loop inherit the `strategyId`.

4. **What is the right prompt scope for strategy context injection?**
   - What we know: Full portfolio injection risks context window overflow; no injection misses LLM context for portfolio decisions
   - What's unclear: At what sub-goal granularity does the agent need portfolio context?
   - Recommendation: Inject compact portfolio summary (one line per strategy, ~20 tokens each) into every sub-goal system prompt. Agent can call `db` tool for details when it needs them.

---

## Key Architectural Insight: Minimal New Code Required

The existing codebase already implements 90% of what Phase 7 needs:

| Need | Existing Solution | Gap |
|------|------------------|-----|
| Parallel strategy execution | `Supervisor` + `AgentLoop` (already parallel by goalId) | None — works today |
| LLM-driven planning | `planGoalDecomposition` + `GoalManager` | Add strategy context to prompt |
| Outcome evaluation | `EvaluatorImpl` (dual metric + LLM) | Add P&L data to evaluation context |
| Operator reasoning logs | `decision_log` table + JSONB reasoning | Add strategyId to decision log entries |
| Web research tools | `http` + `shell` tools registered at startup | None — already available to agent |
| P&L aggregation | `getPnl()` in `pnl-view.ts` | Add `strategyId` filter parameter |
| Capital tracking | `wallet_transactions` + `spend_limits` | Add `strategyId` to `wallet_transactions` |

New code required:
1. `packages/db/src/schema/strategies.ts` — new table
2. `apps/agent/src/strategy/strategy-manager.ts` — CRUD + portfolio context builder
3. Schema migrations: add `strategyId` FK to `operating_costs`, change `revenue.strategyId` to integer FK
4. Extend `pnl-view.ts` `getPnl()` to filter by `strategyId`
5. Extend `AgentLoop.executeSubGoal()` to accept and inject portfolio context
6. Wire `StrategyManager` into `apps/agent/src/index.ts` startup

---

## Sources

### Primary (HIGH confidence)
- Codebase direct inspection (`apps/agent/src/`, `packages/db/src/schema/`) — all existing patterns verified by reading source files
- `apps/agent/src/loop/agent-loop.ts` — AgentLoop implementation, system prompt structure
- `apps/agent/src/loop/goal-manager.ts` — GoalManager pattern to follow for StrategyManager
- `apps/agent/src/multi-agent/supervisor.ts` — Parallel execution already working
- `packages/db/src/schema/pnl-view.ts` — Existing P&L query functions to extend
- `packages/db/src/schema/revenue.ts` — Existing `strategyId` (text) field
- `packages/db/src/schema/operating-costs.ts` — Missing `strategyId` (needs addition)
- `packages/db/src/schema/decision-log.ts` — Append-only log pattern
- `apps/agent/src/index.ts` — Full startup wiring sequence

### Secondary (MEDIUM confidence)
- BullMQ docs (https://docs.bullmq.io/guide/architecture) — confirmed existing BullMQ patterns are correct for Phase 7 parallel execution
- SagaLLM paper (VLDB 2025) — audit trail design for LLM reasoning chains confirms `decision_log` JSONB pattern is industry-aligned

### Tertiary (LOW confidence)
- WebSearch findings on "agentic portfolio management" and "multi-agent LLM" systems — general landscape confirmation; no specific patterns adopted from these

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all existing packages
- Architecture: HIGH — derived directly from reading production code
- Pitfalls: HIGH — identified from code inspection (e.g., `revenue.strategyId` text type mismatch is a real issue in the codebase)
- New schema design: MEDIUM — recommended state machine is Claude's Discretion; reasonable but not externally validated

**Research date:** 2026-02-18
**Valid until:** 2026-04-18 (stable domain; 60-day validity — library versions won't change)
