---
phase: 04-wallet-and-financial-governance
plan: 01
subsystem: database
tags: [solana, wallet, drizzle-orm, unix-socket, ipc, hmac, ed25519, zod, bs58]

# Dependency graph
requires:
  - phase: 01-infrastructure
    provides: drizzle-orm schema patterns, @jarvis/db package, postgres connection
provides:
  - wallet_transactions table with status enum and purpose tracking (WALLET-06)
  - spend_limits table with per-transaction and daily aggregate lamport ceilings (WALLET-04)
  - wallet_config key-value table for runtime Solana config (RPC URL, public key, etc.)
  - "@jarvis/wallet package with IPC signing co-process and agent-side client"
  - Zod-validated newline-delimited JSON IPC protocol (SignRequest/SignResponse)
affects:
  - 04-02-spend-governance
  - 04-03-swap-execution
  - any phase that needs to sign Solana transactions

# Tech tracking
tech-stack:
  added:
    - "@solana/kit@2.3.0 — Ed25519 key pair creation and byte signing"
    - "bs58@6.0.0 — base58 private key decoding"
    - "zod@3.24.2 — IPC wire format validation (already in tools, new in wallet)"
  patterns:
    - "Co-process isolation: private key loaded in separate process, never crosses IPC boundary"
    - "HMAC-SHA256 with timingSafeEqual for Unix socket authentication"
    - "Newline-delimited JSON over Unix socket for IPC protocol"
    - "Zod discriminated union on 'ok' field for typed success/error responses"

key-files:
  created:
    - packages/db/src/schema/wallet-transactions.ts
    - packages/db/src/schema/spend-limits.ts
    - packages/db/src/schema/wallet-config.ts
    - packages/wallet/package.json
    - packages/wallet/tsconfig.json
    - packages/wallet/src/index.ts
    - packages/wallet/src/signer/protocol.ts
    - packages/wallet/src/signer/server.ts
    - packages/wallet/src/client/signer-client.ts
  modified:
    - packages/db/src/schema/index.ts
    - packages/db/drizzle.config.ts
    - packages/db/src/schema/goals.ts
    - packages/db/src/schema/sub-goals.ts

key-decisions:
  - "signBytes (raw byte signing) used instead of @solana/kit transaction object API — signer stays format-agnostic, returns 64-byte Ed25519 signature as base64"
  - "Sub-goals co-located in goals.ts — cross-file .js imports break drizzle-kit CJS bundler; sub-goals.ts becomes a re-export shim for backward compat"
  - "Socket permissions set to 0o600 post-bind as defense in depth alongside HMAC auth"
  - "process.send('ready') guarded by if (process.send) — allows standalone and child_process.fork() run modes"

patterns-established:
  - "IPC signing pattern: client computes HMAC over payload, signer verifies with timingSafeEqual before signing"
  - "Drizzle schema co-location: tables with cross-file FK dependencies must share the same .ts file to avoid drizzle-kit CJS bundler failure"

requirements-completed: [WALLET-04, WALLET-06]

# Metrics
duration: 8min
completed: 2026-02-18
---

# Phase 4 Plan 1: Wallet DB Schemas and IPC Signing Co-process Summary

**Three Postgres tables for wallet governance (transactions, spend limits, config) plus a Unix socket signing co-process that holds the private key in isolation, authenticated by HMAC-SHA256**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-18T22:28:47Z
- **Completed:** 2026-02-18T22:36:47Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- wallet_transactions, spend_limits, and wallet_config tables pushed to Postgres with correct columns, types, and wallet_tx_status enum
- @jarvis/wallet package scaffolded with IPC signing server (Unix socket, HMAC-SHA256, Ed25519 via @solana/kit) and agent-side client (SignerClient with 10s timeout and ping)
- Zod-validated IPC wire protocol (SignRequest with UUID correlation, SignResponse discriminated union)
- Auto-fixed pre-existing drizzle-kit CJS bundler failure that was blocking all future DB pushes

## Task Commits

Each task was committed atomically:

1. **Task 1: DB schemas for wallet transactions, spend limits, and config** - `61a3a4c` (feat)
2. **Task 2: @jarvis/wallet package with IPC signing service and client** - `b4c2f30` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `packages/db/src/schema/wallet-transactions.ts` - wallet_tx_status enum + wallet_transactions table with purpose, lamports, status tracking
- `packages/db/src/schema/spend-limits.ts` - spend_limits table with per-tx and daily aggregate lamport ceilings
- `packages/db/src/schema/wallet-config.ts` - wallet_config key-value table for runtime Solana config
- `packages/db/src/schema/index.ts` - added three new barrel re-exports
- `packages/db/drizzle.config.ts` - added three new schema paths, removed sub-goals.ts (merged into goals.ts)
- `packages/db/src/schema/goals.ts` - merged subGoals definition here to fix drizzle-kit cross-file import bug
- `packages/db/src/schema/sub-goals.ts` - converted to re-export shim for backward compat
- `packages/wallet/package.json` - @jarvis/wallet package with @solana/kit, bs58, zod deps
- `packages/wallet/tsconfig.json` - composite:true, extends @jarvis/typescript-config
- `packages/wallet/src/index.ts` - barrel: SignerClient, SignRequest, SignResponse
- `packages/wallet/src/signer/protocol.ts` - Zod SignRequest (hmac+txBase64+requestId) and SignResponse (ok discriminated union)
- `packages/wallet/src/signer/server.ts` - Unix socket signing co-process with HMAC auth, Ed25519 signing, 0o600 perms
- `packages/wallet/src/client/signer-client.ts` - SignerClient class: signTransaction (10s timeout), ping methods

## Decisions Made
- Used `signBytes` (raw byte signing) instead of @solana/kit's higher-level transaction API — the signer stays format-agnostic and returns the 64-byte Ed25519 signature encoded as base64; callers embed the signature into the transaction structure themselves
- Supports both JSON array-of-numbers (Solana CLI format) and base58 private key encoding for maximum compatibility
- Socket permissions set to 0o600 post-bind as defense in depth alongside HMAC authentication
- `process.send('ready')` guarded by `if (process.send)` to support both standalone and `child_process.fork()` execution modes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pre-existing drizzle-kit CJS cross-file import failure blocking all DB pushes**
- **Found during:** Task 1 (attempting db:push)
- **Issue:** `sub-goals.ts` imported `{ goals }` from `./goals.js`. drizzle-kit's internal CJS bundler (esbuild-register) cannot resolve `.js` extensions back to `.ts` files when processing cross-file schema imports. This caused `db:push` to fail with `MODULE_NOT_FOUND` error on `./goals.js` — the same failure would have blocked every future schema migration.
- **Fix:** Merged `subGoals` table definition into `goals.ts` (same file as the `goals` table it references). Converted `sub-goals.ts` to a re-export shim `export { subGoals, ... } from './goals.js'`. Removed `sub-goals.ts` from `drizzle.config.ts` since the content is now in `goals.ts`.
- **Files modified:** `packages/db/src/schema/goals.ts`, `packages/db/src/schema/sub-goals.ts`, `packages/db/drizzle.config.ts`
- **Verification:** `pnpm --filter @jarvis/db db:push` succeeded, pushing all Phase 3 + Phase 4 schemas. All 14 tables now exist in Postgres including the previously missing `goals` and `sub_goals`.
- **Committed in:** `61a3a4c` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Fix was necessary to unblock db:push entirely. No scope creep — sub-goals export API unchanged from external perspective.

## Issues Encountered
- drizzle-kit CJS bundler cross-file import limitation discovered during first db:push attempt. Root cause: drizzle-kit bundles `.ts` schema files using an internal esbuild-register CJS runtime, which cannot resolve `.js` extension imports to their `.ts` counterparts when those files are cross-file references. Self-referential FKs within a single file (like planning-cycles.ts) work fine; cross-file FKs (sub-goals.ts importing goals.ts) do not. Fix: co-locate related tables that have FK dependencies.

## User Setup Required
**External services require manual configuration** for the signing co-process:

Environment variables needed before running the signer:

| Variable | Source |
|----------|--------|
| `SOLANA_PRIVATE_KEY` | Solana CLI keypair export (JSON array-of-numbers) or base58 string |
| `SIGNER_SHARED_SECRET` | Generate with: `openssl rand -hex 32` |
| `SIGNER_SOCKET_PATH` | Optional, defaults to `/tmp/jarvis-signer.sock` |

Run the signer: `pnpm --filter @jarvis/wallet signer`

## Next Phase Readiness
- All three DB tables exist and are queryable; types exported from @jarvis/db
- @jarvis/wallet exports SignerClient, SignRequest, SignResponse for use in Phase 4 Plan 2 (spend governance)
- Signer process ready to launch once SOLANA_PRIVATE_KEY and SIGNER_SHARED_SECRET are set
- Plan 4-02 (spend governance) can import SpendLimit and WalletTransaction types from @jarvis/db

## Self-Check: PASSED

All key files verified present on disk:
- packages/db/src/schema/wallet-transactions.ts: FOUND
- packages/db/src/schema/spend-limits.ts: FOUND
- packages/db/src/schema/wallet-config.ts: FOUND
- packages/wallet/src/signer/server.ts: FOUND
- packages/wallet/src/client/signer-client.ts: FOUND
- packages/wallet/src/signer/protocol.ts: FOUND

All commits verified in git history:
- 61a3a4c: FOUND (feat: DB schemas)
- b4c2f30: FOUND (feat: @jarvis/wallet package)
- 8a9416b: FOUND (docs: plan metadata)

---
*Phase: 04-wallet-and-financial-governance*
*Completed: 2026-02-18*
