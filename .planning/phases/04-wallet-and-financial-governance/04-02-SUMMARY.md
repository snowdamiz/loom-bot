---
phase: 04-wallet-and-financial-governance
plan: 02
subsystem: wallet
tags: [solana, spl-token, balance, spend-governance, discord, drizzle-orm, bigint]

# Dependency graph
requires:
  - phase: 04-01
    provides: "@jarvis/wallet package scaffold, wallet_config/spend_limits/wallet_transactions DB tables"
  - phase: 02-ai-backbone-and-safety
    provides: "sendOperatorDm from @jarvis/ai for Discord notifications"
provides:
  - "SOL balance query via @solana/kit v2 createSolanaRpc (lamports as string for BigInt safety)"
  - "SPL token balance query via @solana/web3.js v1 getParsedTokenAccountsByOwner against both TOKEN_PROGRAM_ID and TOKEN_2022_PROGRAM_ID"
  - "DB-backed wallet config reader: getWalletConfig/getRequiredWalletConfig/setWalletConfig from wallet_config table"
  - "Spend limit enforcement: per-transaction ceiling and rolling 24h daily aggregate via checkSpendLimits"
  - "Discord DM operator notification on spend limit breach and high-value transactions (non-fatal)"
affects:
  - 04-03-swap-execution
  - any phase performing on-chain transactions

# Tech tracking
tech-stack:
  added:
    - "@solana/spl-token@0.4.14 — TOKEN_PROGRAM_ID/TOKEN_2022_PROGRAM_ID constants and getParsedTokenAccountsByOwner via web3.js Connection"
    - "@solana/web3.js@1.98.4 — Connection class for v1 parsed token account API (coexists with @solana/kit v2)"
  patterns:
    - "Dual-program SPL balance scan: query both TOKEN_PROGRAM_ID and TOKEN_2022_PROGRAM_ID with Promise.all for complete token inventory"
    - "Rolling 24h aggregate window with NOW() - INTERVAL '24 hours' for timezone-agnostic daily spend tracking"
    - "BigInt-throughout for lamport arithmetic — no parseFloat on spend limit values, only on DB aggregate sums"
    - "Non-fatal Discord DM: env var check + stderr log + try/catch around sendOperatorDm, never throws"
    - "RPC URL sanitization: strip query params before logging to prevent API key exposure"

key-files:
  created:
    - packages/wallet/src/client/balance.ts
    - packages/wallet/src/client/config.ts
    - packages/wallet/src/governance/limits.ts
    - packages/wallet/src/governance/notify.ts
  modified:
    - packages/wallet/src/index.ts
    - packages/wallet/package.json

key-decisions:
  - "Rolling 24h window for daily aggregate (NOW() - INTERVAL '24 hours') — avoids calendar-day timezone ambiguity"
  - "No active spend limit row = allow all transactions — high generous defaults per locked decision"
  - "BigInt used throughout lamport comparisons in limits.ts — coerce only for DB aggregate sum (which comes back as numeric string)"
  - "RPC URL sanitization strips query params before error logging to prevent API key leakage in logs"

patterns-established:
  - "Config pattern: getWalletConfig/getRequiredWalletConfig abstraction over wallet_config table — callers use WalletConfigKeys constants not raw strings"
  - "Notification pattern: check env vars first, log to stderr if missing, wrap Discord call in try/catch — never throws"

requirements-completed: [WALLET-01, WALLET-05]

# Metrics
duration: 4min
completed: 2026-02-18
---

# Phase 4 Plan 2: Balance Reading and Spend Governance Summary

**SOL/SPL token balance queries from on-chain RPC plus per-transaction and rolling 24h daily aggregate spend governance with Discord DM breach notifications — all config read from DB, not env vars**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-18T22:41:30Z
- **Completed:** 2026-02-18T22:45:30Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Balance reading system: getBalances() fetches SOL via @solana/kit v2 and all SPL tokens via @solana/web3.js v1 against both TOKEN_PROGRAM_ID and TOKEN_2022_PROGRAM_ID
- DB-backed wallet config: getWalletConfig/getRequiredWalletConfig/setWalletConfig read RPC URL and wallet public key from wallet_config table at runtime
- Spend governance: checkSpendLimits enforces per-tx ceiling and rolling 24h daily aggregate from spend_limits DB table; uses BigInt throughout for precision
- Discord breach notifications: notifySpendLimitBreach and notifyHighValueTransaction send DMs to operator; fully non-fatal per established Phase 2/3 pattern

## Task Commits

Each task was committed atomically:

1. **Task 1: Balance reading and wallet config** - `d832d64` (feat)
2. **Task 2: Spend governance with limit enforcement and Discord notification** - `00b46d5` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `packages/wallet/src/client/config.ts` - getWalletConfig/getRequiredWalletConfig/setWalletConfig reading from wallet_config table; WalletConfigKeys constants
- `packages/wallet/src/client/balance.ts` - getBalances: SOL via @solana/kit createSolanaRpc, SPL tokens via @solana/web3.js Connection.getParsedTokenAccountsByOwner (both program IDs)
- `packages/wallet/src/governance/limits.ts` - checkSpendLimits, getActiveSpendLimit, getTodaySpentLamports with rolling 24h window and BigInt arithmetic
- `packages/wallet/src/governance/notify.ts` - notifySpendLimitBreach, notifyHighValueTransaction — non-fatal Discord DMs via @jarvis/ai sendOperatorDm
- `packages/wallet/src/index.ts` - updated barrel: exports all balance, config, governance, and notification functions
- `packages/wallet/package.json` - added @solana/spl-token, @solana/web3.js, @jarvis/ai deps

## Decisions Made
- Rolling 24h window for daily aggregate rather than calendar-day reset — avoids timezone ambiguity (UTC midnight vs local midnight issues)
- No active limit row = allow all — "high generous defaults" per locked decision in REQUIREMENTS.md
- BigInt used throughout for lamport comparisons; only coerce to Number for the DB sum aggregate result (which Postgres returns as numeric string)
- RPC URL sanitized in error messages (query params stripped) to prevent API keys leaking into logs

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — this plan only reads from the existing wallet_config and spend_limits tables. The signing co-process setup from Plan 01 covers all env var requirements.

## Next Phase Readiness
- getBalances() ready for use in Plan 4-03 swap execution to check wallet balance before trades
- checkSpendLimits() ready to gate all send transactions in Plan 4-03
- notifyHighValueTransaction() ready to call after swap submission in Plan 4-03
- @jarvis/wallet build is clean; all governance and balance exports are typed

## Self-Check: PASSED

Key files verified present on disk:
- packages/wallet/src/client/balance.ts: FOUND
- packages/wallet/src/client/config.ts: FOUND
- packages/wallet/src/governance/limits.ts: FOUND
- packages/wallet/src/governance/notify.ts: FOUND

All commits verified in git history:
- d832d64: FOUND (feat: balance reading and wallet config)
- 00b46d5: FOUND (feat: spend governance)

---
*Phase: 04-wallet-and-financial-governance*
*Completed: 2026-02-18*
