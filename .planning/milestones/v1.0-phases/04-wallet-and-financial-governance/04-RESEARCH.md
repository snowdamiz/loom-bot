# Phase 4: Wallet and Financial Governance - Research

**Researched:** 2026-02-18
**Domain:** Solana wallet integration, IPC signing service, spend governance, transaction audit
**Confidence:** HIGH (core Solana SDK) / MEDIUM (DeFi SDK choices) / HIGH (IPC patterns)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Signing service boundary:**
- Co-process via IPC (Unix socket or stdin/stdout), not a separate HTTP service
- Agent authenticates to signer — Claude's discretion on mechanism (shared secret vs socket permissions)
- Private key stored in environment variable, loaded by signing service at startup
- Signing service is a pure signer — it signs any valid Solana transaction the agent submits
- Spend limit enforcement is in a separate governance layer on the agent side, not in the signer

**Spend governance:**
- Per-transaction + daily aggregate limits (required by roadmap success criteria)
- High generous defaults so the AI operates freely — safety net, not a constraint
- Limits stored in database table — changeable at runtime without restart, dashboard-editable in Phase 5
- On limit breach: reject transaction + Discord DM to operator
- Agent can retry with smaller amount or wait for daily reset

**Token scope:**
- SOL + any SPL token — no allowlist, if it's in the wallet it's usable
- Full DeFi primitives: transfers, swaps (Jupiter etc.), staking, LP positions
- Signing service supports arbitrary Solana transaction signing to enable all of the above
- Inbound tokens: AI is notified of new/unexpected tokens and decides what to do with them
- Mainnet-beta only — no devnet configuration
- All Solana configuration (RPC URL, etc.) stored in database, accessible by the AI — no env vars for Solana config

**Transaction audit trail:**
- AI self-reports purpose as free-text string with each transaction request
- On-chain transaction signature (tx hash) stored with every transaction record
- Transaction history fully queryable by the AI for decision-making (past sends, amounts, purposes, timestamps)
- Operator notifications via configurable threshold — notify above a set amount, configurable in DB

### Claude's Discretion
- IPC authentication mechanism (shared secret vs Unix socket permissions)
- Specific DeFi SDK/library choices (Jupiter SDK, Raydium, etc.)
- Transaction table schema design
- Balance polling frequency and caching strategy
- Error handling for failed transactions

### Deferred Ideas (OUT OF SCOPE)
- Agent building its own financial tools/strategies on top of wallet primitives — Phase 8 (Self-Extension)
- Dashboard visibility into transactions — Phase 5 (Web Dashboard)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| WALLET-01 | Agent can read its wallet balance (SOL and SPL tokens) | `getBalance()` for SOL via `@solana/kit` RPC; `getParsedProgramAccounts()` with TOKEN_PROGRAM_ID + TOKEN_2022_PROGRAM_ID filter for all SPL tokens. Cached in DB, polled on schedule. |
| WALLET-02 | Agent can send SOL and SPL tokens to specified addresses | SOL: `getTransferSolInstruction` + `@solana-program/system`; SPL: `createTransferCheckedInstruction` from `@solana/spl-token` (with correct program ID auto-detected). All routed through signer IPC co-process. |
| WALLET-03 | Agent can receive SOL and SPL tokens | `accountSubscribe` WebSocket subscription for SOL; SPL token ATAs monitored via `onProgramAccountChange`. New/unexpected token notifications dispatched to agent decision queue. |
| WALLET-04 | Private key never appears in LLM context, logs, or tool outputs | Private key lives exclusively in signer co-process env var. Signer receives unsigned transaction bytes only. Agent-facing tools only return tx signature and status. Signer logs suppress key material. |
| WALLET-05 | Signing service enforces per-transaction and daily aggregate spending limits | Governance layer on agent side (per locked decision): DB table `spend_limits`, runtime-mutable. Pre-sign check: (a) per-tx amount <= limit, (b) daily_spent + amount <= daily_limit. Breach triggers reject + Discord DM. |
| WALLET-06 | All transactions are logged with destination, amount, and stated purpose | `wallet_transactions` DB table: tx_signature, destination, amount_lamports, token_mint, purpose (free text from AI), status, created_at. Queryable by AI via db tool. |
</phase_requirements>

---

## Summary

This phase integrates a Solana wallet into the Jarvis agent system using a split-process architecture: a signing co-process holds the private key in isolation, and the agent process handles all wallet logic, governance, and observability. The two halves communicate via Unix socket IPC.

The Solana SDK landscape is in active transition. `@solana/web3.js` v1.x is maintenance-only; its successor is `@solana/kit` (formerly web3.js v2), released stable in November 2024. New projects should use `@solana/kit`. However, for SPL token operations the situation is bifurcated: `@solana/spl-token` works with web3.js v1 Connection objects, while kit-native equivalents are `@solana-program/token` and `@solana-program/token-2022`. Since Jupiter's swap API is HTTP-based (not SDK-bound), DeFi routing is straightforward regardless of SDK choice.

The most complex design area is the IPC boundary and spend governance. The signer is a simple, stateless process: it receives serialized unsigned transaction bytes, signs them with the key loaded from env at startup, and returns the signed bytes. All governance (spend limits, daily aggregates, notifications) is enforced by the agent before the transaction bytes are sent to the signer. This keeps the trust boundary explicit and the signer auditable.

**Primary recommendation:** Use `@solana/kit` + `@solana/spl-token` together (they can interop via `@solana/web3-compat`), Unix socket IPC with a shared-secret HMAC challenge for authentication, Jupiter v6 Swap API (HTTP) for DeFi swaps, and Drizzle `pgTable` for both `wallet_transactions` and `spend_limits` tables following the project's established schema patterns.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@solana/kit` | latest (1.x) | Solana RPC, transaction building, subscriptions | Successor to web3.js v1; modular, tree-shakable, 10x faster crypto ops via native Ed25519 |
| `@solana/spl-token` | latest | SPL token transfers, ATA creation/lookup, Token-2022 support | Official SPL token JS library; covers both TOKEN_PROGRAM_ID and TOKEN_2022_PROGRAM_ID |
| `@solana-program/system` | latest | `getTransferSolInstruction` for SOL sends | Auto-generated from on-chain IDL; type-safe |
| `@jup-ag/api` | latest | Jupiter v6 HTTP Swap API client | De facto DEX aggregator for Solana; `@jup-ag/core` is deprecated |
| `node:net` | built-in | Unix socket IPC server (signer) and client (agent) | Zero-dependency, OS-level security for socket file permissions |
| `node:crypto` | built-in | HMAC-SHA256 for IPC authentication challenge/response | No extra dependencies; standard pattern for local IPC auth |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@solana-developers/helpers` | latest | `getKeypairFromEnvironment()` utility | Loading keypair from env var inside signer process |
| `bs58` | latest | Base58 encode/decode for private key env var | Standard Solana key format |
| `@solana/web3-compat` | latest | Bridge between web3.js v1 API surface and kit runtime | If any dependency still requires v1 Connection objects |
| `zod` | ^3 (already in project) | Schema validation for IPC message protocol | Already used project-wide; validates signer request/response shapes |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@solana/kit` | `@solana/web3.js` v1 | v1 is maintenance-only; kit is the future. v1 acceptable if Anchor integration is needed (Anchor doesn't support kit yet). This phase does NOT use Anchor, so kit is correct. |
| Jupiter HTTP API | `@jup-ag/core` SDK | `@jup-ag/core` is deprecated. HTTP API has no SDK lock-in, works with any Solana SDK version. |
| Unix socket IPC | stdin/stdout IPC | Unix sockets allow persistent connection with less overhead and OS-level file permission security. stdin/stdout is simpler but less robust for long-running service. |
| HMAC shared secret auth | Unix socket file permissions (chmod 600) | Socket permissions alone protect against other users; HMAC protects against same-user process impersonation. Both are Claude's discretion. Recommendation: HMAC + socket permissions (defense in depth). |
| `@solana/spl-token` | `@solana-program/token` + `@solana-program/token-2022` | kit-native packages are fully tree-shakable; `@solana/spl-token` requires web3.js v1 Connection. Either works but `@solana/spl-token` has better ecosystem coverage and examples currently. |

**Installation:**
```bash
# Agent-side (apps/agent or new packages/wallet package)
pnpm add @solana/kit @solana/spl-token @solana-program/system @jup-ag/api bs58

# Signer co-process (can be same or separate package)
pnpm add @solana/kit @solana-developers/helpers bs58
```

---

## Architecture Patterns

### Recommended Project Structure
```
packages/
├── wallet/                  # New package: all Solana wallet logic
│   ├── src/
│   │   ├── signer/
│   │   │   ├── server.ts    # IPC signer process (loads private key, listens on Unix socket)
│   │   │   └── protocol.ts  # Zod schemas for IPC request/response wire format
│   │   ├── client/
│   │   │   ├── signer-client.ts   # Agent-side: connects to signer via Unix socket
│   │   │   ├── balance.ts         # SOL + SPL balance queries with caching
│   │   │   ├── send.ts            # Build + govern + sign SOL/SPL transfers
│   │   │   ├── subscribe.ts       # WebSocket subscriptions for inbound monitoring
│   │   │   └── defi/
│   │   │       └── jupiter.ts     # Jupiter swap quote + transaction build
│   │   ├── governance/
│   │   │   ├── limits.ts          # Spend limit check: per-tx + daily aggregate
│   │   │   └── notify.ts          # Discord DM on limit breach
│   │   └── index.ts
│   └── package.json

packages/tools/src/
├── wallet/
│   ├── index.ts             # Tool definitions: get_balance, send_sol, send_token, get_tx_history
│   └── ...

packages/db/src/schema/
├── wallet-transactions.ts   # Transaction audit table
├── spend-limits.ts          # Runtime-mutable governance limits
└── wallet-config.ts         # RPC URL + other Solana config (DB-stored, AI-accessible)
```

### Pattern 1: IPC Signing Co-Process

**What:** The signer is a Node.js process started as a child by the agent. It holds the private key in memory and listens on a Unix socket. The agent sends it an unsigned transaction (as base64 bytes) and receives a signed transaction back. The agent then broadcasts via its own RPC connection.

**When to use:** Always — for every transaction the agent initiates.

**Signer server (simplified):**
```typescript
// packages/wallet/src/signer/server.ts
// Source: node:net official docs + HMAC design pattern
import { createServer } from 'node:net';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { unlinkSync, existsSync } from 'node:fs';
import { createKeyPairSignerFromBytes } from '@solana/kit';
import bs58 from 'bs58';

const SOCKET_PATH = process.env.SIGNER_SOCKET_PATH!;
const SHARED_SECRET = process.env.SIGNER_SHARED_SECRET!;
const PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY!;

// Load keypair at startup — never again
const keypairBytes = Uint8Array.from(JSON.parse(PRIVATE_KEY)); // array-of-numbers format
const signer = await createKeyPairSignerFromBytes(keypairBytes);

// NEVER log signer.address or any key material

if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH); // clean stale socket

const server = createServer((socket) => {
  let buf = '';
  socket.setEncoding('utf8');

  socket.on('data', async (chunk) => {
    buf += chunk;
    if (!buf.includes('\n')) return; // wait for full message

    const line = buf.slice(0, buf.indexOf('\n'));
    buf = buf.slice(buf.indexOf('\n') + 1);

    const request = JSON.parse(line); // { hmac, txBase64 }

    // Verify HMAC — timing-safe comparison
    const expected = createHmac('sha256', SHARED_SECRET)
      .update(request.txBase64)
      .digest('hex');

    if (!timingSafeEqual(Buffer.from(request.hmac), Buffer.from(expected))) {
      socket.write(JSON.stringify({ error: 'auth_failed' }) + '\n');
      return;
    }

    // Sign the transaction
    const txBytes = Buffer.from(request.txBase64, 'base64');
    // ... sign using @solana/kit signTransaction primitives ...
    // ... return base64 signed bytes ...
    socket.write(JSON.stringify({ signedTxBase64: '...' }) + '\n');
  });
});

server.listen(SOCKET_PATH);
```

**Agent-side signer client:**
```typescript
// packages/wallet/src/client/signer-client.ts
import { createConnection } from 'node:net';
import { createHmac } from 'node:crypto';

export class SignerClient {
  constructor(
    private readonly socketPath: string,
    private readonly sharedSecret: string
  ) {}

  async signTransaction(txBase64: string): Promise<string> {
    const hmac = createHmac('sha256', this.sharedSecret)
      .update(txBase64)
      .digest('hex');

    return new Promise((resolve, reject) => {
      const socket = createConnection(this.socketPath);
      socket.write(JSON.stringify({ hmac, txBase64 }) + '\n');

      let buf = '';
      socket.on('data', (chunk) => {
        buf += chunk;
        if (!buf.includes('\n')) return;
        const response = JSON.parse(buf.slice(0, buf.indexOf('\n')));
        socket.destroy();
        if (response.error) reject(new Error(response.error));
        else resolve(response.signedTxBase64);
      });

      socket.on('error', reject);
    });
  }
}
```

### Pattern 2: Balance Query with Caching

**What:** SOL balance via `rpc.getBalance()`, all SPL balances via `getParsedProgramAccounts()` against both TOKEN_PROGRAM_ID and TOKEN_2022_PROGRAM_ID. Results cached to DB with a TTL; polling interval stored in DB config.

```typescript
// Source: Verified from @solana/kit docs + QuickNode guides
import { createSolanaRpc, address } from '@solana/kit';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { Connection, GetProgramAccountsFilter } from '@solana/web3.js'; // v1 compat for spl-token

// Get SOL balance (kit API)
const rpc = createSolanaRpc(rpcUrl);
const { value: lamports } = await rpc.getBalance(address(walletPublicKey)).send();

// Get all SPL token accounts (both programs)
const connection = new Connection(rpcUrl); // for @solana/spl-token calls
const filters: GetProgramAccountsFilter[] = [
  { dataSize: 165 },
  { memcmp: { offset: 32, bytes: walletPublicKey } }
];

const [splAccounts, spl2022Accounts] = await Promise.all([
  connection.getParsedProgramAccounts(TOKEN_PROGRAM_ID, { filters }),
  connection.getParsedProgramAccounts(TOKEN_2022_PROGRAM_ID, { filters })
]);
```

**Caching strategy (Claude's discretion recommendation):** Poll every 60 seconds, store balance snapshot in `wallet_balances` table with `fetched_at`. Agent tool reads from cache first, refreshes if > 60s old. WebSocket subscription triggers immediate cache invalidation on incoming transfers.

### Pattern 3: SOL Transfer (full flow)

```typescript
// Source: QuickNode Solana Kit guide + @solana-program/system
import {
  createSolanaRpc, createSolanaRpcSubscriptions,
  createTransactionMessage, setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction, pipe, lamports, address,
  getBase64EncodedWireTransaction,
} from '@solana/kit';
import { getTransferSolInstruction } from '@solana-program/system';

// 1. Build unsigned transaction
const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

const txMessage = pipe(
  createTransactionMessage({ version: 0 }),
  (msg) => setTransactionMessageFeePayer(address(walletPublicKey), msg),
  (msg) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, msg),
  (msg) => appendTransactionMessageInstruction(
    getTransferSolInstruction({
      amount: lamports(BigInt(amountLamports)),
      destination: address(destinationPublicKey),
      source: address(walletPublicKey), // signer added by signing service
    }),
    msg
  )
);

// 2. Serialize unsigned tx → base64
const unsignedBase64 = getBase64EncodedWireTransaction(/* compile txMessage */);

// 3. Send to signer co-process
const signedBase64 = await signerClient.signTransaction(unsignedBase64);

// 4. Broadcast via agent's RPC
const signature = await rpc.sendTransaction(signedBase64, { encoding: 'base64' }).send();
```

### Pattern 4: SPL Token Transfer

```typescript
// Source: Helius SPL transfer guide + @solana/spl-token official docs
import {
  getOrCreateAssociatedTokenAccount,
  createTransferCheckedInstruction,
  getMint,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import { Connection, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';

// Auto-detect correct program for this mint
const mintInfo = await connection.getAccountInfo(new PublicKey(mintAddress));
const tokenProgram = mintInfo?.owner.equals(TOKEN_2022_PROGRAM_ID)
  ? TOKEN_2022_PROGRAM_ID
  : TOKEN_PROGRAM_ID;

// Get/create source and destination ATAs
const mint = await getMint(connection, new PublicKey(mintAddress), 'confirmed', tokenProgram);
const sourceATA = await getOrCreateAssociatedTokenAccount(
  connection, feePayerKeypair, mint.address, new PublicKey(walletPublicKey), false, 'confirmed', {}, tokenProgram
);
const destATA = await getOrCreateAssociatedTokenAccount(
  connection, feePayerKeypair, mint.address, new PublicKey(destinationPublicKey), false, 'confirmed', {}, tokenProgram
);

// Build transfer instruction
const transferIx = createTransferCheckedInstruction(
  sourceATA.address,
  mint.address,
  destATA.address,
  new PublicKey(walletPublicKey), // owner
  BigInt(amount),
  mint.decimals,
  [],
  tokenProgram
);
// ... add to transaction, sign via IPC, broadcast ...
```

### Pattern 5: Jupiter Swap (HTTP API)

```typescript
// Source: Jupiter official docs (dev.jup.ag/docs/swap-api)
// Jupiter Metis API base: https://api.jup.ag/swap/v1/

// Step 1: Get quote
const quoteResponse = await fetch(
  `https://api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=50`
).then(r => r.json());

// Step 2: Build swap transaction
const { swapTransaction } = await fetch('https://api.jup.ag/swap/v1/swap', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    quoteResponse,
    userPublicKey: walletPublicKey,
    dynamicComputeUnitLimit: true,
    dynamicSlippage: true,
    prioritizationFeeLamports: {
      priorityLevelWithMaxLamports: { maxLamports: 1_000_000, priorityLevel: 'veryHigh' }
    }
  })
}).then(r => r.json());

// swapTransaction is base64 serialized; send directly to signer, then broadcast
const signedTx = await signerClient.signTransaction(swapTransaction);
const signature = await rpc.sendTransaction(signedTx, { encoding: 'base64' }).send();
```

### Pattern 6: Spend Governance Pre-Check

```typescript
// packages/wallet/src/governance/limits.ts
// All limit enforcement happens BEFORE sending to signer
export async function checkSpendLimits(
  db: DbClient,
  amountLamports: bigint,
  tokenMint: string | null // null = SOL
): Promise<{ allowed: boolean; reason?: string }> {
  // Load limits from DB (runtime-mutable)
  const limits = await db.query.spendLimits.findFirst({ where: eq(spendLimits.active, true) });
  if (!limits) return { allowed: true }; // no limits configured = allow

  // Per-transaction check
  if (amountLamports > BigInt(limits.perTransactionLamports)) {
    return { allowed: false, reason: `Exceeds per-transaction limit of ${limits.perTransactionLamports} lamports` };
  }

  // Daily aggregate check
  const todaySpent = await getTodaySpentLamports(db);
  if (todaySpent + amountLamports > BigInt(limits.dailyAggregateLamports)) {
    return { allowed: false, reason: `Would exceed daily aggregate limit` };
  }

  return { allowed: true };
}
```

### Pattern 7: Inbound Token Monitoring

```typescript
// packages/wallet/src/client/subscribe.ts
// Source: QuickNode Solana Kit subscriptions guide
import { createSolanaRpcSubscriptions, address } from '@solana/kit';

const rpcSubscriptions = createSolanaRpcSubscriptions(wssUrl);

// Monitor SOL balance changes
const accountNotifications = await rpcSubscriptions
  .accountNotifications(address(walletPublicKey), { commitment: 'confirmed' })
  .subscribe({ abortSignal: controller.signal });

for await (const notification of accountNotifications) {
  // New SOL received — invalidate cache, notify agent
  await handleInboundSol(notification);
}
```

### Anti-Patterns to Avoid

- **Private key in agent process:** The key must ONLY exist in the signer co-process. Never pass it via tool call params, IPC request bodies, or any logging path.
- **Using devnet config:** Phase is mainnet-beta only. Accidentally using devnet burns no real SOL but the agent will believe it has/sent funds it doesn't. Store RPC URL in DB to prevent hardcoding.
- **Floating point for lamport amounts:** Always use `BigInt` or string for lamports/token amounts. JavaScript `Number` loses precision above 2^53, which is well within Solana's u64 range. The project already uses `numeric` (exact decimal) in Postgres — match this in DB schema.
- **Blocking the event loop during signing:** IPC calls are async I/O. The signer client must use async/await with proper timeout handling. Never spin-wait.
- **Signing before governance check:** Governance (spend limits) MUST run first. If the signer is called first and then the governance check fails, the signed bytes are wasted but there's no real risk — however, the architectural invariant is: govern → sign → broadcast.
- **Not handling ATA creation cost:** Sending an SPL token to an address that has never held that token requires creating an ATA, which costs ~0.002 SOL. The agent must fund/account for this or the transaction will fail.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DEX routing | Custom routing across Orca/Raydium/Meteora | Jupiter v6 HTTP API | Jupiter aggregates all major DEX liquidity; routing is NP-hard across 20+ pools |
| ATA address derivation | Custom PDA derivation | `getAssociatedTokenAddressSync()` from `@solana/spl-token` | Off-by-one errors in PDA derivation cause silent fund loss |
| Transaction serialization | Custom byte packing | `@solana/kit` pipe + transaction builders | Solana's versioned transaction format (v0) with ALTs is non-trivial |
| Key loading from env | Parse env string manually | `getKeypairFromEnvironment()` from `@solana-developers/helpers` | Handles both array-of-numbers and base58 formats, validates key length |
| HMAC timing-safe comparison | `===` string comparison | `timingSafeEqual` from `node:crypto` | String comparison is timing-vulnerable; `timingSafeEqual` is constant-time |
| Blockhash management | Caching/reusing old blockhashes | Always fetch fresh via `rpc.getLatestBlockhash()` | Blockhashes expire after ~150 slots (~60s); reuse causes silent tx rejection |

**Key insight:** Solana transaction construction has many sharp edges (versioned transactions, ALTs, compute budgets, priority fees) that are handled correctly by established libraries. Hand-rolling any of these creates fund-loss risk.

---

## Common Pitfalls

### Pitfall 1: Token-2022 Program ID Mismatch
**What goes wrong:** Sending a Token-2022 token using TOKEN_PROGRAM_ID (the original SPL token program ID) — transaction fails with obscure program ownership error.
**Why it happens:** Two active token programs on mainnet: original (TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA) and Token-2022 (TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb). `@solana/spl-token` supports both but you must pass the correct program ID.
**How to avoid:** Always check the mint account's owner program before building instructions. Auto-detect pattern provided in Pattern 4 above.
**Warning signs:** `Program TokenkegQ... failed: custom program error: 0x3` or similar token program errors.

### Pitfall 2: Private Key Format Ambiguity
**What goes wrong:** `Keypair.fromSecretKey()` or `createKeyPairSignerFromBytes()` throws because the private key env var is in an unexpected format.
**Why it happens:** Solana keys are stored in multiple formats: base58 string, JSON array of numbers `[1,2,3...]`, or raw bytes. Different tools produce different formats.
**How to avoid:** Use `getKeypairFromEnvironment()` from `@solana-developers/helpers` which handles both array-of-numbers and base58. Establish a convention (array-of-numbers is standard per Solana CLI) and document it.
**Warning signs:** `TypeError: invalid argument` or keypair with wrong address at startup.

### Pitfall 3: Unix Socket Left on Filesystem
**What goes wrong:** Signer fails to start because the socket file already exists from a previous crash.
**Why it happens:** Node.js `server.listen(SOCKET_PATH)` fails with `EADDRINUSE` if the path exists, even if no process owns it.
**How to avoid:** Always `unlinkSync(SOCKET_PATH)` if it exists before calling `server.listen()`. Register `SIGTERM`/`SIGINT` handlers to clean up the socket on graceful shutdown.
**Warning signs:** `Error: listen EADDRINUSE` on signer startup.

### Pitfall 4: Jupiter API Rate Limits / No API Key
**What goes wrong:** Jupiter public endpoint starts returning 429 or errors under moderate load.
**Why it happens:** `https://api.jup.ag` is a public endpoint; heavy use requires an API key.
**How to avoid:** Store the Jupiter API key (if any) in the DB config alongside the RPC URL. The `x-api-key` header is supported per the official docs. For low-frequency agent use, the public endpoint is likely fine initially.
**Warning signs:** HTTP 429 responses from api.jup.ag.

### Pitfall 5: Daily Aggregate Reset Timing
**What goes wrong:** Daily spend aggregate doesn't reset at midnight, or resets at wrong timezone, causing limit confusion.
**Why it happens:** `WHERE created_at >= NOW() - INTERVAL '24 hours'` is a rolling window, not calendar-day reset. Using UTC vs local time inconsistently.
**How to avoid:** Define "daily" explicitly in code and in DB schema comments. Recommendation: rolling 24-hour window (simpler, no timezone ambiguity). Store all timestamps in UTC (Postgres default with `timestamp` without timezone is UTC by convention; use `withTimezone: true` for safety).
**Warning signs:** Limit unexpectedly reached mid-morning or agent able to send more than daily limit over two calendar days.

### Pitfall 6: Transaction Not Confirmed Before Logging
**What goes wrong:** Transaction is logged with a signature but never confirmed — the on-chain tx failed or was dropped, but DB shows it as sent.
**Why it happens:** `sendTransaction()` returns a signature immediately; the tx may still fail during simulation or be dropped by the network under congestion.
**How to avoid:** Log two states: `status: 'submitted'` on send, then `status: 'confirmed'` or `status: 'failed'` after using `rpc.confirmTransaction()` / `signatureSubscribe`. The agent should surface failed transactions to its decision loop.
**Warning signs:** DB shows sends that don't appear in block explorers.

### Pitfall 7: RPC WebSocket Disconnection
**What goes wrong:** Inbound token monitoring silently stops working after WebSocket disconnects.
**Why it happens:** WebSocket connections to Solana RPC nodes drop after ~1-2 minutes of inactivity or due to node restarts. The subscription silently stops delivering events.
**How to avoid:** Implement reconnection logic. `@solana/kit`'s `createSolanaRpcSubscriptions` supports `AbortController` for cleanup. Wrap the subscription loop in a retry mechanism with exponential backoff.
**Warning signs:** Agent stops receiving inbound token notifications but no errors are logged.

---

## Code Examples

Verified patterns from official sources and guides (all above in Architecture Patterns). Key additional examples:

### DB Schema: wallet_transactions
```typescript
// packages/db/src/schema/wallet-transactions.ts
// Follows project conventions from operating-costs.ts and revenue.ts
import { integer, numeric, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const txStatusEnum = pgEnum('wallet_tx_status', [
  'submitted',  // sent to network, not yet confirmed
  'confirmed',  // on-chain confirmed
  'failed',     // confirmed but tx failed, or dropped
  'rejected',   // rejected by governance before signing
]);

export const walletTransactions = pgTable('wallet_transactions', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  // On-chain signature (null until submitted to network)
  txSignature: text('tx_signature'),
  // 'sol' for native SOL transfers, mint address for SPL tokens
  tokenMint: text('token_mint').notNull().default('sol'),
  destinationAddress: text('destination_address'),
  // Amounts stored as string to avoid BigInt precision loss
  amountLamports: text('amount_lamports').notNull(),
  // AI self-reported purpose — free text
  purpose: text('purpose').notNull(),
  status: txStatusEnum('status').notNull().default('submitted'),
  // Rejection reason if governance blocked it
  rejectionReason: text('rejection_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
});

export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type NewWalletTransaction = typeof walletTransactions.$inferInsert;
```

### DB Schema: spend_limits
```typescript
// packages/db/src/schema/spend-limits.ts
import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const spendLimits = pgTable('spend_limits', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  // Amounts in lamports (SOL) — stored as text to avoid BigInt issues
  perTransactionLamports: text('per_transaction_lamports').notNull(),
  dailyAggregateLamports: text('daily_aggregate_lamports').notNull(),
  // Operator notification threshold: notify if tx amount exceeds this
  notifyAboveLamports: text('notify_above_lamports').notNull(),
  // Only one row should be active at a time
  active: boolean('active').notNull().default(true),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
```

### DB Schema: wallet_config (Solana config in DB, not env)
```typescript
// packages/db/src/schema/wallet-config.ts
// Per locked decision: all Solana config stored in DB, accessible by AI
import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const walletConfig = pgTable('wallet_config', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  key: text('key').notNull().unique(), // e.g. 'rpc_url', 'wss_url', 'jupiter_api_key'
  value: text('value').notNull(),
  description: text('description'),
  active: boolean('active').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
```

### IPC Protocol (Zod schemas)
```typescript
// packages/wallet/src/signer/protocol.ts
import { z } from 'zod';

export const SignRequest = z.object({
  hmac: z.string().length(64),          // hex HMAC-SHA256
  txBase64: z.string().min(1),           // base64-encoded unsigned transaction bytes
  requestId: z.string().uuid(),          // for correlation in logs (NOT logged in signer)
});

export const SignResponse = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), signedTxBase64: z.string(), requestId: z.string().uuid() }),
  z.object({ ok: z.literal(false), error: z.enum(['auth_failed', 'sign_error', 'invalid_tx']), requestId: z.string().uuid() }),
]);

export type SignRequest = z.infer<typeof SignRequest>;
export type SignResponse = z.infer<typeof SignResponse>;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@solana/web3.js` v1 (`Connection` class) | `@solana/kit` (functional API, `createSolanaRpc`) | Nov 2024 (stable) | v1 is maintenance-only; kit is the path forward |
| `@jup-ag/core` npm SDK | `@jup-ag/api` HTTP client + fetch | 2024 (core deprecated) | No SDK lock-in; HTTP API is stable and simpler |
| `serial` primary keys in Drizzle | `.generatedAlwaysAsIdentity()` | Drizzle ORM 2024/2025 | PostgreSQL identity columns are the modern standard |
| `@solana/spl-token` only | `@solana/spl-token` (v1 compat) OR `@solana-program/token` + `@solana-program/token-2022` (kit-native) | 2024 | Token-2022 is live on mainnet; must handle both programs |
| `@solana/web3.js` v2 (transitional name) | `@solana/kit` (renamed from web3.js v2) | Late 2024/Early 2025 | Same library, renamed; documentation and npm package are now `@solana/kit` |

**Deprecated/outdated:**
- `@jup-ag/core`: Deprecated. Use Jupiter HTTP API via fetch or `@jup-ag/api`.
- `@solana/web3.js` v1 Connection class: Still works but maintenance-only. No new features.
- Anchor framework: Does NOT support `@solana/kit` yet (as of research date). Not relevant to this phase since we're not writing on-chain programs, but important context for Phase 8.
- `@solana/spl-token-registry`: Deprecated community token list. Not needed since decision is "no allowlist."

---

## Open Questions

1. **IPC authentication: HMAC vs socket permissions only?**
   - What we know: Unix socket file permissions (chmod 600, same-user) prevent cross-user attacks. HMAC-SHA256 on request body additionally prevents same-user process impersonation.
   - What's unclear: Is same-user process impersonation a realistic threat in this deployment context (the agent and signer run as the same OS user in Docker)?
   - Recommendation: Use both — socket chmod 600 AND HMAC. The overhead is negligible (single SHA256 per tx), and defense-in-depth is the right posture for a system handling real money. The shared secret is passed via signer process environment at spawn time.

2. **@solana/kit vs @solana/web3.js v1 for SPL token operations?**
   - What we know: `@solana/spl-token` (which requires v1 Connection) is more mature with better docs. `@solana-program/token` (kit-native) exists but has fewer community examples. They can coexist via `@solana/web3-compat`.
   - What's unclear: Whether `@solana/web3-compat` introduces significant bundle size or runtime overhead in a Node.js server context.
   - Recommendation: Use `@solana/kit` for transaction building and RPC calls; use `@solana/spl-token` (with v1 Connection wrapper) for SPL-specific operations like ATA management. They don't conflict in Node.js. Revisit in Phase 8 if complexity grows.

3. **Balance polling frequency?**
   - What we know: Public Solana RPC is rate-limited to 100 req/10s. WebSocket subscriptions are more efficient for change detection.
   - What's unclear: Whether to poll or subscribe-only for balance updates.
   - Recommendation: Poll every 60 seconds as baseline (store last-fetched in DB), with WebSocket subscription triggering immediate refresh on any account change. This gives fresh data for agent decisions without hammering the RPC.

4. **How to handle failed/dropped transactions?**
   - What we know: Solana transactions expire if the blockhash is > ~150 slots old. Network congestion can drop txs.
   - What's unclear: Should the agent auto-retry failed sends, or surface to decision loop?
   - Recommendation: Surface to decision loop with `status: 'failed'` in the tx record. The agent can decide to retry. Do not auto-retry silently — the agent's purpose field may need updating or the amount may need adjustment.

---

## Sources

### Primary (HIGH confidence)
- `@solana/kit` official GitHub (github.com/anza-xyz/kit) — SDK architecture, API surface
- Anza official announcement (anza.xyz/blog/solana-web3-js-2-release) — stable release Nov 2024
- `@solana/spl-token` npm (npmjs.com/package/@solana/spl-token) — Token-2022 support, program ID handling
- `node:net` Node.js official docs (nodejs.org/api/net.html) — Unix socket IPC API
- `node:crypto` built-in — `timingSafeEqual`, `createHmac`
- Drizzle ORM docs (orm.drizzle.team) — `generatedAlwaysAsIdentity`, schema patterns
- Jupiter official docs (dev.jup.ag/docs/swap-api) — API endpoints and parameters

### Secondary (MEDIUM confidence)
- QuickNode Solana Kit guide (quicknode.com/guides/solana-development/tooling/web3-2/transfer-sol) — SOL transfer code examples
- QuickNode SPL token guide (quicknode.com/guides/solana-development/spl-tokens/how-to-transfer-spl-tokens-on-solana) — complete SPL transfer flow
- QuickNode WebSocket guide (quicknode.com/guides/solana-development/tooling/web3-2/subscriptions) — Solana Kit subscription patterns
- Helius SPL transfer guide (helius.dev/blog/solana-dev-101-how-to-transfer-solana-tokens-with-typescript) — TypeScript code examples
- Helius WebSocket docs (helius.dev/docs/rpc/websocket) — RPC rate limits and enhanced WS
- QuickNode getSignaturesForAddress docs — transaction history querying

### Tertiary (LOW confidence)
- HMAC-for-IPC design: standard security pattern synthesized from multiple sources; no single authoritative Solana-specific reference found. Concept is well-established in systems security literature.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `@solana/kit` stable release verified via official Anza blog; `@solana/spl-token` current via npm; Jupiter API current via official docs
- Architecture (IPC signer): HIGH — `node:net` Unix socket API is stable and well-documented; HMAC pattern is standard
- Architecture (spend governance): HIGH — straightforward DB pattern; follows existing project conventions
- DeFi SDK choices: MEDIUM — Jupiter API is well-documented; staking/LP would need additional research when implementing those specific tools (deferred per phase scope)
- Pitfalls: HIGH — Token-2022 and ATA issues are well-documented; socket lifecycle and tx confirmation issues verified from official docs

**Research date:** 2026-02-18
**Valid until:** 2026-03-18 (30 days; Solana SDK stable, Jupiter API stable; reassess if major version changes)
