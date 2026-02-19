# Phase 4: Wallet and Financial Governance - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Solana wallet integration with a signing service, spend governance, and transaction audit trail. The agent can read balances, send/receive SOL and any SPL token, interact with DeFi programs (swaps, staking, LP), and every transaction is governed by configurable limits and logged with its stated purpose. The private key never enters the agent's context.

This is the bootstrapped financial foundation — the agent will build additional financial capabilities on top of this in later phases.

</domain>

<decisions>
## Implementation Decisions

### Signing service boundary
- Co-process via IPC (Unix socket or stdin/stdout), not a separate HTTP service
- Agent authenticates to signer — Claude's discretion on mechanism (shared secret vs socket permissions)
- Private key stored in environment variable, loaded by signing service at startup
- Signing service is a pure signer — it signs any valid Solana transaction the agent submits
- Spend limit enforcement is in a separate governance layer on the agent side, not in the signer

### Spend governance
- Per-transaction + daily aggregate limits (required by roadmap success criteria)
- High generous defaults so the AI operates freely — safety net, not a constraint
- Limits stored in database table — changeable at runtime without restart, dashboard-editable in Phase 5
- On limit breach: reject transaction + Discord DM to operator
- Agent can retry with smaller amount or wait for daily reset

### Token scope
- SOL + any SPL token — no allowlist, if it's in the wallet it's usable
- Full DeFi primitives: transfers, swaps (Jupiter etc.), staking, LP positions
- Signing service supports arbitrary Solana transaction signing to enable all of the above
- Inbound tokens: AI is notified of new/unexpected tokens and decides what to do with them
- Mainnet-beta only — no devnet configuration
- All Solana configuration (RPC URL, etc.) stored in database, accessible by the AI — no env vars for Solana config

### Transaction audit trail
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

</decisions>

<specifics>
## Specific Ideas

- "The AI decides everything" — philosophy is maximum AI autonomy with safety nets, not restrictive governance
- Bootstrapped functionality concept — this phase provides the financial foundation, the agent builds more on top (Phase 8: Self-Extension)
- Spend limits exist for roadmap compliance but are set generously so they don't constrain normal operation

</specifics>

<deferred>
## Deferred Ideas

- Agent building its own financial tools/strategies on top of wallet primitives — Phase 8 (Self-Extension)
- Dashboard visibility into transactions — Phase 5 (Web Dashboard)

</deferred>

---

*Phase: 04-wallet-and-financial-governance*
*Context gathered: 2026-02-18*
