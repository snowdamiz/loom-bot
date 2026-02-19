---
phase: 04-wallet-and-financial-governance
verified: 2026-02-18T23:35:00Z
status: human_needed
score: 13/13 must-haves verified
re_verification: true
  previous_status: gaps_found
  previous_score: 12/13
  gaps_closed:
    - "Every send (SPL token) goes through governance check before signing — sendSplToken now calls checkSpendLimits(db, BigInt(amount), mintAddress) as Step 0 before any RPC calls or signing"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Send SOL through the agent tool and verify the wallet_transactions record appears with correct tx_signature, destination, amount, and purpose"
    expected: "Row in wallet_transactions with status='confirmed', non-null tx_signature, matching destination and purpose"
    why_human: "Requires a live Solana devnet or mainnet RPC, funded wallet, and SOLANA_PRIVATE_KEY + SIGNER_SHARED_SECRET configured. Cannot verify end-to-end broadcast without network."
  - test: "Set a spend limit below 1 SOL and attempt to send 2 SOL; verify rejection and operator Discord DM"
    expected: "send_sol returns success=false, wallet_transactions row with status='rejected' and rejection_reason, Discord DM received"
    why_human: "Requires live Discord bot configuration and DB row insertion to spend_limits table."
  - test: "Attempt an SPL token send exceeding the per-transaction limit; verify rejection is logged with status='rejected' and rejectionReason"
    expected: "wallet_transactions row with status='rejected', rejectionReason matching the limit message, no RPC call made, non-blocking breach notification fired"
    why_human: "Requires live DB with a spend_limits row configured and a connected Solana RPC to create a test scenario."
  - test: "Start the agent with SOLANA_PRIVATE_KEY set and verify signer co-process forks, sends 'ready', and wallet tools appear in LLM tool list"
    expected: "Four tools (get_balance, send_sol, send_token, get_tx_history) visible to the LLM after startup"
    why_human: "Requires running the agent process with env vars configured."
---

# Phase 4: Wallet and Financial Governance Verification Report

**Phase Goal:** The agent has a bank account on Solana with structural spend governance -- it can read balances, send and receive tokens, but never touches the private key, and every transaction is governed by limits and logged with its stated purpose
**Verified:** 2026-02-18T23:35:00Z
**Status:** human_needed (all automated checks pass; live-network tests remain)
**Re-verification:** Yes — after gap closure (Plan 04-04 closed the SPL token governance gap)

## Re-Verification Summary

**Previous status:** gaps_found (12/13 — SPL token sends bypassed checkSpendLimits)
**Current status:** human_needed (13/13 — gap closed, automated checks pass)

**Gap closed:** `sendSplToken` in `packages/wallet/src/client/send.ts` now calls `checkSpendLimits(db, BigInt(amount), mintAddress)` as Step 0 (line 233) before any RPC calls or signing. Rejected SPL sends are logged with `status='rejected'` and `rejectionReason` (lines 239-248). A non-blocking `notifySpendLimitBreach` fires on rejection (line 253). The old "governance skipped" language was removed; JSDoc updated to accurately describe enforcement.

**Regressions:** None detected. All 12 previously-verified truths remain intact.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Wallet transaction schema exists with tx_signature, destination, amount, purpose, and status tracking | VERIFIED | `packages/db/src/schema/wallet-transactions.ts` — walletTxStatusEnum with 4 values, walletTransactions table with all required columns |
| 2 | Spend limits schema exists with per-transaction and daily aggregate limits stored in DB | VERIFIED | `packages/db/src/schema/spend-limits.ts` — spendLimits table with perTransactionLamports, dailyAggregateLamports, notifyAboveLamports, active flag |
| 3 | Wallet config schema stores Solana configuration in DB, not in env vars | VERIFIED | `packages/db/src/schema/wallet-config.ts` — walletConfig key-value table; `packages/wallet/src/client/config.ts` reads from DB via getRequiredWalletConfig |
| 4 | Signing co-process loads private key from env and signs arbitrary transaction bytes | VERIFIED | `packages/wallet/src/signer/server.ts` — reads SOLANA_PRIVATE_KEY, supports JSON array and base58 formats, signs via @solana/kit signBytes |
| 5 | Agent-side signer client sends unsigned tx bytes and receives signed tx bytes via Unix socket IPC | VERIFIED | `packages/wallet/src/client/signer-client.ts` — SignerClient.signTransaction uses createConnection over Unix socket, newline-delimited JSON protocol |
| 6 | Private key never appears outside the signer process — not in IPC messages, not in logs | VERIFIED | server.ts only logs public key address; SOLANA_PRIVATE_KEY raw value is never logged; send.ts and tools/index.ts have zero references to SOLANA_PRIVATE_KEY (grep count: 0 in both files) |
| 7 | IPC authentication uses HMAC-SHA256 with timing-safe comparison | VERIFIED | `packages/wallet/src/signer/server.ts` lines 69-79 — timingSafeEqual(new Uint8Array(expected), new Uint8Array(received)); client computes HMAC over txBase64 |
| 8 | Agent can query SOL balance in lamports and all SPL token balances across both TOKEN_PROGRAM_ID and TOKEN_2022_PROGRAM_ID | VERIFIED | `packages/wallet/src/client/balance.ts` — getBalances queries @solana/kit createSolanaRpc for SOL, Promise.all on both token program IDs via web3.js Connection |
| 9 | Spend governance rejects a transaction that exceeds per-transaction limit or daily rolling aggregate | VERIFIED | `packages/wallet/src/governance/limits.ts` — checkSpendLimits checks perTransactionLamports ceiling, then rolling 24h window via NOW() - INTERVAL '24 hours' |
| 10 | Governance breach triggers Discord DM notification to operator (non-fatal) | VERIFIED | `packages/wallet/src/governance/notify.ts` — notifySpendLimitBreach and notifyHighValueTransaction use sendOperatorDm from @jarvis/ai, wrapped in try/catch, non-fatal |
| 11 | Agent can send SOL with governance -> signing -> broadcast -> DB log pipeline | VERIFIED | `packages/wallet/src/client/send.ts` sendSol: checkSpendLimits -> build tx -> insert 'submitted' -> signerClient.signTransaction -> sendRawTransaction -> update 'confirmed' |
| 12 | Every send (SOL) goes through governance check before signing — rejected sends are logged with rejection_reason | VERIFIED | sendSol calls checkSpendLimits (line 94) before any signing; rejection inserts wallet_transactions with status='rejected' (line 106) and rejectionReason (line 107) |
| 12b | Every send (SPL token) goes through governance check before signing — rejected sends are logged with rejection_reason | VERIFIED | sendSplToken calls checkSpendLimits(db, BigInt(amount), mintAddress) at line 233 as Step 0 before any RPC/signing; rejection inserts wallet_transactions with status='rejected' (line 245) and rejectionReason (line 246); notifySpendLimitBreach fires at line 253 |
| 13 | Wallet tools (get_balance, send_sol, send_token, get_tx_history) are registered in tool registry; signer co-process forked and shut down gracefully | VERIFIED | `packages/tools/src/wallet/index.ts` creates all 4 tools; agent forks via node:child_process.fork, awaits 'ready' IPC, kills on SIGTERM |

**Score:** 13/13 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/db/src/schema/wallet-transactions.ts` | Transaction audit table with status enum | VERIFIED | walletTxStatusEnum + walletTransactions table, WalletTransaction/NewWalletTransaction types exported |
| `packages/db/src/schema/spend-limits.ts` | Runtime-mutable spend governance limits | VERIFIED | spendLimits table with per-tx and daily ceilings; SpendLimit/NewSpendLimit types exported |
| `packages/db/src/schema/wallet-config.ts` | Key-value Solana config stored in DB | VERIFIED | walletConfig table with key/value/active/updatedAt; WalletConfig/NewWalletConfig types exported |
| `packages/wallet/src/signer/server.ts` | Unix socket signing co-process | VERIFIED | createServer, HMAC verify, signBytes, process.send('ready'), 0o600 socket perms, SIGTERM/SIGINT handlers |
| `packages/wallet/src/client/signer-client.ts` | Agent-side IPC client for signing | VERIFIED | SignerClient class with signTransaction (10s timeout) and ping methods |
| `packages/wallet/src/signer/protocol.ts` | Zod-validated IPC wire format | VERIFIED | SignRequest (hmac + txBase64 + requestId uuid) and SignResponse discriminated union on ok field |
| `packages/wallet/src/client/balance.ts` | SOL and SPL token balance queries | VERIFIED | getBalances reads from DB config, queries both TOKEN_PROGRAM_ID and TOKEN_2022_PROGRAM_ID |
| `packages/wallet/src/client/config.ts` | DB-backed wallet configuration reader | VERIFIED | getWalletConfig, getRequiredWalletConfig, setWalletConfig, WalletConfigKeys constants |
| `packages/wallet/src/governance/limits.ts` | Per-tx and daily aggregate spend limit enforcement | VERIFIED | checkSpendLimits, getActiveSpendLimit, getTodaySpentLamports with rolling 24h window |
| `packages/wallet/src/governance/notify.ts` | Discord DM on limit breach or high-value transaction | VERIFIED | notifySpendLimitBreach, notifyHighValueTransaction — non-fatal, env var guarded, try/catch |
| `packages/wallet/src/client/send.ts` | SOL and SPL token send functions with governance + signing + logging | VERIFIED | sendSol has full governance pipeline; sendSplToken NOW has checkSpendLimits at Step 0 (line 233) before any RPC/signing — gap closed |
| `packages/wallet/src/client/subscribe.ts` | WebSocket subscriptions for inbound SOL and SPL monitoring | VERIFIED | subscribeToWallet with accountNotifications + onProgramAccountChange x2, 10-attempt reconnection |
| `packages/tools/src/wallet/index.ts` | Agent-facing wallet tool definitions | VERIFIED | createWalletTools factory returning 4 ToolDefinitions with correct names, schemas, timeouts |
| `apps/agent/src/index.ts` | Signer co-process lifecycle and wallet tool registration | VERIFIED | fork(signerServerPath), await 'ready' (10s timeout), SignerClient, register 4 tools, openAITools re-derived |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `signer-client.ts` | `signer/server.ts` | Unix socket IPC with HMAC auth | WIRED | createConnection(this.socketPath); HMAC computed and sent; timingSafeEqual verified on server side |
| `db/schema/index.ts` | `wallet-transactions.ts` | barrel re-export | WIRED | `export * from './wallet-transactions.js'` |
| `db/schema/index.ts` | `spend-limits.ts` | barrel re-export | WIRED | `export * from './spend-limits.js'` |
| `db/schema/index.ts` | `wallet-config.ts` | barrel re-export | WIRED | `export * from './wallet-config.js'` |
| `balance.ts` | `wallet-config.ts` | reads RPC URL from wallet_config table | WIRED | getRequiredWalletConfig(db, WalletConfigKeys.RPC_URL) and WalletConfigKeys.WALLET_PUBLIC_KEY |
| `limits.ts` | `spend-limits.ts` | reads active spend limits from DB | WIRED | .from(spendLimits).where(eq(spendLimits.active, true)) |
| `limits.ts` | `wallet-transactions.ts` | sums today's spending from transaction log | WIRED | .from(walletTransactions)... AND createdAt >= NOW() - INTERVAL '24 hours' |
| `send.ts` (sendSol) | `limits.ts` | checkSpendLimits called before signing | WIRED | checkSpendLimits(db, amountLamportsBigInt) at line 94 — Step 1 |
| `send.ts` (sendSplToken) | `limits.ts` | checkSpendLimits called before signing | WIRED | checkSpendLimits(db, BigInt(amount), mintAddress) at line 233 — Step 0, before any RPC or signing; gap closed by Plan 04-04 |
| `send.ts` | `signer-client.ts` | signerClient.signTransaction for IPC signing | WIRED | buildSignAndEncode calls signerClient.signTransaction(messageBase64) |
| `send.ts` | `wallet-transactions.ts` | inserts on send, updates on confirm/fail | WIRED | .insert(walletTransactions) for submitted/rejected; .update for confirmed/failed with tx_signature |
| `tools/src/wallet/index.ts` | `balance.ts` | get_balance tool calls getBalances | WIRED | import { getBalances } from '@jarvis/wallet'; execute calls getBalances(db) |
| `tools/src/wallet/index.ts` | `send.ts` | send_sol/send_token tools call sendSol/sendSplToken | WIRED | import { sendSol, sendSplToken } from '@jarvis/wallet'; both execute handlers call through |
| `apps/agent/src/index.ts` | `signer/server.ts` | child_process.fork to start signer co-process | WIRED | fork(signerServerPath, [], { env: { SIGNER_SOCKET_PATH, SIGNER_SHARED_SECRET, SOLANA_PRIVATE_KEY } }) |

---

### Requirements Coverage

| Requirement | REQUIREMENTS.md Definition | Source Plans | Status | Evidence |
|-------------|---------------------------|--------------|--------|---------|
| WALLET-01 | Agent can read its wallet balance (SOL and SPL tokens) | Plan 02 | SATISFIED | getBalances() queries SOL via @solana/kit and SPL via web3.js; exported and wired to get_balance tool |
| WALLET-02 | Agent can send SOL and SPL tokens to specified addresses | Plan 03 | SATISFIED | sendSol and sendSplToken implemented, wired to send_sol/send_token tools |
| WALLET-03 | Agent can receive SOL and SPL tokens | Plan 03 | SATISFIED | subscribeToWallet monitors accountNotifications (SOL) + onProgramAccountChange x2 (TOKEN_PROGRAM_ID + TOKEN_2022_PROGRAM_ID); started in agent index.ts |
| WALLET-04 | Private key never appears in LLM context, logs, or tool outputs | Plan 01 | SATISFIED | Private key loaded only in signer/server.ts; only public key logged; IPC sends tx bytes not key; SOLANA_PRIVATE_KEY grep count = 0 in send.ts and tools/wallet/index.ts |
| WALLET-05 | Signing service enforces per-transaction and daily aggregate spending limits | Plans 02, 04 | SATISFIED | checkSpendLimits called in BOTH sendSol (line 94) and sendSplToken (line 233) before any signing. Per-tx and daily rolling 24h aggregate enforced for all outbound sends. Gap from initial verification closed by Plan 04-04. |
| WALLET-06 | All transactions are logged with destination, amount, and stated purpose | Plans 01, 03 | SATISFIED | wallet_transactions table has purpose column (notNull); every sendSol and sendSplToken code path inserts a row with status, destination, amount, and purpose before and after signing |

All 6 WALLET requirements are fully satisfied. No orphaned requirements detected (REQUIREMENTS.md Traceability maps WALLET-01 through WALLET-06 to Phase 4, exactly matching plan declarations).

---

### Anti-Patterns Found

None. The modified `packages/wallet/src/client/send.ts` contains no TODO/FIXME/placeholder comments, no empty implementations, and no stub returns. The "governance skipped" NOTE that was flagged in the initial verification has been removed.

---

### Human Verification Required

### 1. End-to-End SOL Send

**Test:** With SOLANA_PRIVATE_KEY, SIGNER_SHARED_SECRET, and wallet_config rows (rpc_url, wallet_public_key) configured, call the send_sol tool with a small amount and valid destination.
**Expected:** wallet_transactions row appears with status='confirmed', non-null tx_signature, matching destination, amountLamports, and purpose. Solana explorer confirms the transaction.
**Why human:** Requires live network, funded wallet, and full env configuration.

### 2. SOL Spend Limit Enforcement

**Test:** Insert a row into spend_limits with a low perTransactionLamports ceiling. Attempt a SOL send above that ceiling.
**Expected:** send_sol returns success=false, wallet_transactions row with status='rejected' and rejection_reason matching the limit message. No transaction broadcast.
**Why human:** Requires DB access to configure limits and verifying the Discord DM reaches the operator.

### 3. SPL Token Spend Limit Enforcement (new — gap was closed)

**Test:** Insert a row into spend_limits with a low perTransactionLamports ceiling. Attempt an SPL token send with an amount (in base units) exceeding that ceiling.
**Expected:** sendSplToken returns success=false before any RPC call is made, wallet_transactions row with status='rejected' and rejection_reason. Discord DM fires non-blocking. No Solana transaction is broadcast.
**Why human:** Requires live DB with spend_limits row and configured SIGNER_SHARED_SECRET. The critical property — that governance fires before any RPC call — is structurally verified (Step 0 comes before Step 1 in code), but runtime confirmation needs an actual DB connection.

### 4. Agent Startup Wallet Initialization

**Test:** Start the agent with SOLANA_PRIVATE_KEY and SIGNER_SHARED_SECRET set. Observe stderr output.
**Expected:** Signer co-process forks, "[agent] Signer co-process ready" logged, "[agent] Wallet tools registered: get_balance, send_sol, send_token, get_tx_history" logged, openAITools includes all 4 wallet tools.
**Why human:** Requires running the full agent process with env vars.

### 5. Graceful Wallet Degradation

**Test:** Start agent without SOLANA_PRIVATE_KEY.
**Expected:** Agent starts normally, logs "SOLANA_PRIVATE_KEY not set — skipping wallet initialization", no wallet tools in registry, no crash.
**Why human:** Requires running the agent process.

---

### Gaps Summary

No gaps remain. The single gap identified in the initial verification — `sendSplToken` bypassing `checkSpendLimits` — was closed by Plan 04-04:

- `packages/wallet/src/client/send.ts` line 233: `checkSpendLimits(db, BigInt(amount), mintAddress)` is called as Step 0 in `sendSplToken` before any RPC calls, ATA lookups, or signing.
- Rejected SPL sends produce a `wallet_transactions` row with `status='rejected'` and `rejectionReason` (lines 239-248).
- A non-blocking `notifySpendLimitBreach` fires on rejection (line 253) with `.catch()` error logging.
- The old "governance skipped" JSDoc NOTE was removed; the flow description now accurately states governance is enforced.
- Zero occurrences of "governance skip" language remain in the file (grep count: 0).

All 13 observable truths are verified, all 14 artifacts are substantive and wired, all 13 key links are connected, and all 6 WALLET requirements are satisfied. Phase 4 goal is achieved. Remaining items are live-network tests that require running infrastructure.

---

_Verified: 2026-02-18T23:35:00Z_
_Verifier: Claude (gsd-verifier)_
_Re-verification: Yes — after gap closure via Plan 04-04_
