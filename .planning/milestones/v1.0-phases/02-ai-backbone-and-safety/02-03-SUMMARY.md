---
phase: 02-ai-backbone-and-safety
plan: "03"
subsystem: ai
tags: [openrouter, discord.js, cost-monitoring, pnl, drizzle-orm, typescript]

# Dependency graph
requires:
  - phase: 02-01
    provides: "@jarvis/ai package, OpenRouterProvider, DbClient, operatingCosts/revenue/aiCalls tables"
provides:
  - "CreditMonitor class polling GET /api/v1/key with configurable interval and 1-hour debounce"
  - "sendOperatorDm() short-lived Discord client for low-credit operator notifications"
  - "getPnl() computing revenue minus costs with optional date range filtering"
  - "getOperatingCostTotal() summing costs by category"
  - "getRevenueTotal() summing revenue by strategyId (schema-only in Phase 2)"
  - "getAiSpendSummary() agent self-inspection of AI spend by tier"
affects:
  - "03-autonomous-loop (agent can query own AI spend via getAiSpendSummary)"
  - "05-dashboard (P&L data via getPnl)"
  - "07-strategy-engine (revenue tracking via getRevenueTotal)"

# Tech tracking
tech-stack:
  added: [discord.js ^14.x]
  patterns:
    - "Short-lived Discord client per message (connect, send, destroy) — avoids persistent bot overhead for infrequent alerts"
    - "P&L as query functions not SQL views — drizzle db:push does not manage Postgres views"
    - "coalesce(sum(...), '0') pattern — returns '0' string instead of null for empty tables, parsed to 0 number"
    - "1-hour debounce on low-credit alerts — prevents notification spam during sustained low-credit conditions"

key-files:
  created:
    - packages/ai/src/discord.ts
    - packages/ai/src/cost-monitor.ts
    - packages/db/src/schema/pnl-view.ts
  modified:
    - packages/ai/src/index.ts
    - packages/ai/package.json
    - packages/db/src/schema/index.ts

key-decisions:
  - "GET /api/v1/key not /api/v1/credits for balance polling — /api/v1/credits requires management key, /api/v1/key works with standard API key"
  - "Partials.Channel required in discord.js v14 for DM support — without it, bot cannot send/receive direct messages"
  - "CreditMonitorConfig.discordBotToken/discordOperatorUserId are optional — DMs skipped if not set, balance still logged to stderr"
  - "$5.00 low-credit threshold — gives operator enough time to top up without agent running dry mid-task"
  - "getAiSpendSummary() queries ai_calls directly — no need to bridge to operating_costs since ai_calls stores per-call cost"

patterns-established:
  - "Immediate + interval pattern: start() calls recordBalance() immediately then sets interval (same as memory consolidation consolidate() in 01-04)"
  - "Non-fatal Discord failures: DM error logged to stderr but does not throw — balance check failure should not crash the monitor"
  - "parseFloat() on drizzle numeric returns — drizzle returns numeric(12,8) columns as strings; always parse before arithmetic"

requirements-completed: [COST-02, COST-03, COST-04, COST-05]

# Metrics
duration: 3min
completed: 2026-02-18
---

# Phase 2 Plan 03: Cost Monitoring and P&L Summary

**OpenRouter credit balance polling with Discord DM alerts ($5 threshold, 1h debounce) and queryable P&L via getPnl/getAiSpendSummary over operating_costs/revenue/ai_calls tables**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-18T19:14:28Z
- **Completed:** 2026-02-18T19:17:29Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- CreditMonitor polls GET /api/v1/key every 5 minutes, fires Discord DM and stderr warning when remaining credits drop below $5 with 1-hour debounce
- sendOperatorDm() creates a short-lived discord.js v14 client per message with Partials.Channel for DM support
- getPnl() returns revenue minus costs with optional date range, verified to return zeroed PnlSummary on empty database
- getAiSpendSummary() provides agent self-inspection of AI spend totals and per-tier breakdowns from ai_calls table

## Task Commits

Each task was committed atomically:

1. **Task 1: CreditMonitor and Discord DM notification** - `0e4fafb` (feat)
2. **Task 2: P&L query functions and cost aggregation** - `ec9134c` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `packages/ai/src/discord.ts` - sendOperatorDm() short-lived Discord client for operator DM alerts
- `packages/ai/src/cost-monitor.ts` - CreditMonitor class: interval polling, low-credit detection, 1h debounce
- `packages/db/src/schema/pnl-view.ts` - getPnl, getOperatingCostTotal, getRevenueTotal, getAiSpendSummary query functions
- `packages/ai/src/index.ts` - Added exports for discord.js and cost-monitor modules
- `packages/ai/package.json` - Added discord.js ^14.x dependency
- `packages/db/src/schema/index.ts` - Added export for pnl-view.js

## Decisions Made
- Used GET /api/v1/key (not /api/v1/credits) — the standard key endpoint returns limit_remaining and usage without requiring a management key
- Partials.Channel required in discord.js v14 for DM support — plan specified this explicitly as "pitfall 4"
- $5.00 low-credit threshold chosen per Claude's Discretion — enough runway for operator to respond
- Discord DM failure is non-fatal (logged to stderr, does not throw) — network/Discord issues should not crash the credit monitor
- P&L implemented as query functions not SQL views — drizzle db:push does not manage Postgres views; query functions are equally type-safe

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
The following environment variables must be configured before CreditMonitor and Discord DMs will function:

- `OPENROUTER_API_KEY` — from OpenRouter Dashboard -> Settings -> API Keys -> Create Key (required for balance polling)
- `DISCORD_BOT_TOKEN` — from Discord Developer Portal -> Applications -> Bot -> Token (optional; DMs skipped if absent)
- `DISCORD_OPERATOR_USER_ID` — Discord User ID with Developer Mode enabled (optional; DMs skipped if absent)

## Next Phase Readiness
- CreditMonitor and Discord DM utility ready to wire into agent startup in Phase 3 (Autonomous Loop)
- P&L functions ready for dashboard integration in Phase 5
- Revenue table schema is ready; getRevenueTotal() returns 0 until strategy execution populates data in later phases
- No blockers for Phase 3

---
*Phase: 02-ai-backbone-and-safety*
*Completed: 2026-02-18*
