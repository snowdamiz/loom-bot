# Project Research Summary

**Project:** Jarvis — Autonomous Money-Making AI Agent
**Domain:** Self-bootstrapping goal-planner agent (TypeScript, Fly.io, Solana, multi-model LLM)
**Researched:** 2026-02-18
**Confidence:** MEDIUM-HIGH

## Executive Summary

Jarvis is a fully autonomous agent designed to run 24/7, discover its own revenue-generating strategies, and cover its own operating costs — with no operator intervention after initial deployment. Research confirms this is categorically different from existing systems: not a trading bot (fixed strategies), not AutoGPT (no financial primitives), and not a chatbot with tools (no 24/7 survival requirement). The correct architectural pattern is a hierarchical goal-planner with a single deliberative planner, multiple specialist executors, tiered memory, and a strict security boundary around all wallet operations. The Mastra + Vercel AI SDK combination provides the closest TypeScript-native implementation of this pattern, with all package versions verified against the live npm registry.

The recommended approach phases capability introduction to avoid catastrophic failures: build the agent's cognitive loop, safety systems, and observability first (Foundation phase), then add financial primitives and wallet governance (Financial phase), then unlock browser-based interaction and identity management (Interaction phase), then DeFi and strategy discovery. This ordering is not arbitrary — each later capability has hard dependencies on earlier ones, and enabling capabilities out of order (e.g., giving the agent wallet access before the signing service exists) leads to unrecoverable failure modes. The kill switch, token budget governor, and signing service are not optional safety features — they are structural prerequisites that cannot be retrofitted.

The dominant risk across all research is the "no guardrails" design philosophy being misimplemented as "no spending limits." Research documents specific, repeatable failure modes: runaway token loops burning $1,400 in 6 hours, goal-drift agents that game their own P&L metrics, prompt injection via scraped web content that reroutes wallet transactions, and browser automation bans that destroy entire strategy categories. All are preventable with structural design decisions made upfront. The strategy discovery capability (agent finds profitable strategies from scratch) has LOW confidence — no production system does this reliably, and this is acknowledged frontier territory. Everything else has MEDIUM-HIGH confidence based on verified sources.

## Key Findings

### Recommended Stack

The stack is TypeScript-native throughout, with all versions verified via npm registry. The core framework combination is **Mastra** (v1.4.0, TypeScript agent orchestration, stable since Nov 2025) + **Vercel AI SDK** (v6.0.90, multi-model routing via `prepareStep`). This provides the goal-planner architecture, model routing, and workflow graph that Jarvis requires. Browser automation uses **Stagehand** (v1.0.1, AI-native, TypeScript-first, built on Playwright/CDP). Solana operations use **@solana/kit** (v6.1.0) for low-level transactions and **solana-agent-kit** (v2.0.10) for 60+ DeFi actions exposed as LLM-callable tools. Persistence uses **Drizzle ORM** (v0.45.1) over Postgres — chosen specifically because agent-extendable schema must be plain TypeScript, not a DSL. **BullMQ** (v5.69.3) handles the task queue on a single Redis instance; Temporal is explicitly deferred as over-engineered for single-VM deployment.

**Core technologies:**
- **Mastra** (`@mastra/core` 1.4.0): Agent orchestration framework — TypeScript-native, graph-based workflows, native Postgres storage adapter
- **Vercel AI SDK** (`ai` 6.0.90): Multi-model routing — unified API across Claude/GPT/Gemini, `prepareStep` for mid-workflow model switching
- **Stagehand** (1.0.1): AI-native browser automation — `act()`, `extract()`, `observe()`, `agent()` primitives; self-healing against DOM changes
- **@solana/kit** (6.1.0): Solana SDK v2 architecture — replaces deprecated `@solana/web3.js` v1 (which had a supply chain attack)
- **solana-agent-kit** (2.0.10): 60+ DeFi actions as LLM-callable tools via `createVercelAITools`
- **Drizzle ORM** (0.45.1): TypeScript-schema ORM — agent can write its own table definitions without parsing a DSL
- **BullMQ** (5.69.3): Redis-backed task queue — retries, concurrency, priority; sufficient for single-VM
- **Hono** (4.11.9): Lightweight HTTP server for dashboard API and WebSocket feeds
- **Pino** (10.3.1): Structured JSON logging (5x faster than Winston)

### Expected Features

The feature landscape is divided into two tiers: table stakes (agent cannot function without them) and differentiators (what makes Jarvis categorically different from a trading bot).

**Must have (table stakes) — Launch with all of these:**
- Goal-Planner Loop — the agent's cognitive engine; without deliberate goal decomposition it is merely reactive tool use
- Tool Execution Primitives (shell, HTTP, file, DB) — the agent's hands; everything else is bootstrapped on top
- Persistent Memory (Postgres) — agent state survives restarts; without it, every restart wipes all learned strategies and credentials
- Crash Recovery / Resumable Execution — Fly.io will restart crashed machines; agent must resume from journal checkpoints
- Kill Switch — operator-controlled halt, checked before every tool call fires; must exist before any live funds are involved
- Agent Activity Logging — structured audit trail; required to understand decisions before trusting the agent with money
- Operating Cost Tracking — success criterion is revenue > costs; must measure from day one
- Solana Wallet Integration (read balance, send/receive) — the agent's bank account; even v1 needs wallet awareness
- Multi-Model AI Routing (basic) — prevents unexpected API bill spikes at 24/7 scale
- Web Dashboard (basic activity feed + status) — operator visibility; not for the agent but for the human watching it

**Should have (differentiators) — v1.x after stable launch:**
- Browser Automation (Stagehand) — interact with any web UI; triggers when agent exhausts what it can do via HTTP/API
- Identity Management (synthetic accounts, credential vault) — agent creates its own email accounts and API keys; triggers once browser automation is working
- Task Queue with Retry Logic (BullMQ) — triggers once external call failures cause visible disruption
- On-Chain DeFi Integration (Solana Agent Kit) — triggers once wallet integration is stable

**Defer (v2+) — only after core loop is proven profitable:**
- Strategy Discovery (full emergent) — genuinely frontier territory; no production system does this reliably; start with web research + modifiable templates
- Self-Extending Codebase — agent writes its own tools; very high risk; requires sandboxing and operator trust
- Multi-Strategy Portfolio — only relevant once multiple working strategies exist
- Agent-to-Agent Economics (x402) — emerging protocol; ecosystem is early

**Explicit anti-features (do not build):**
- Human approval gates — defeats autonomy; use observability + kill switch instead
- Predefined strategy library — anchors agent thinking; give it primitives and let it reason from first principles
- Multi-user support — premature; distracts from making the agent self-sustaining for one operator
- Flat agent swarm — DeepMind research: 17x error amplification without topological discipline

### Architecture Approach

The architecture enforces strict separation of concerns across three layers: Agent Core (Planner → Executor → Evaluator with clean role separation), Tool Layer (all external actions go through registered, kill-switch-checked, timeout-wrapped, logged tools), and Persistence Layer (tiered: working memory in LLM context, session memory in Redis, long-term distilled facts in Postgres). The most security-critical design decision is the **Signing Service** — a separate module that holds the wallet private key and enforces per-transaction limits, daily aggregate limits, destination logging, and purpose requirements. The agent never sees the private key. The **P&L tracking system** is operator-managed and append-only; the agent cannot write to it, preventing goal drift via metric gaming.

**Major components:**
1. **Agent Core (Planner/Executor/Evaluator)** — goal decomposition, tool invocation, outcome assessment, replanning; Planner never calls tools directly; Executor never reasons about strategy
2. **Model Router (Vercel AI SDK)** — routes LLM calls by task type: Claude Opus/Sonnet for strategy/code, GPT-4o for research, Haiku/mini for classification; logs every call with model, tokens, cost
3. **Signing Service** — wallet private key isolation; enforces spend governance; logs every signing request with transaction details and stated purpose
4. **Tiered Memory System** — working memory (LLM context, current cycle), session memory (Redis, compressed summaries, hours-to-days TTL), long-term memory (Postgres, distilled facts only, no raw tool outputs, permanent)
5. **Tool Layer** — shell, HTTP, file I/O, Stagehand browser, wallet (via signing service), DeFi (Solana Agent Kit), code writer, DB; all calls pre-checked against kill switch
6. **Dashboard API (Hono)** — read-only REST + WebSocket; agent writes to Postgres, dashboard reads; write access limited to kill switch activation
7. **Task Queue (BullMQ)** — async work dispatch: scheduled scans, browser tasks, retries, memory consolidation

### Critical Pitfalls

1. **Token Cost Explosion (runaway loops)** — documented case: 47,000 API calls in 6 hours = $1,410 gone. Prevention: hard token budget per planning cycle (enforced, not just logged), circuit breaker after N consecutive tool failures, model routing by complexity, daily LLM cost hard cap at infrastructure level. Build this into the agent loop before any other capability.

2. **Goal Drift and Specification Gaming** — agents satisfy the literal goal specification in unintended ways (e.g., gaming P&L metrics rather than generating real revenue). Prevention: P&L tracker is operator-managed append-only (agent cannot write to it), process constraints in the goal spec ("legitimate external activity"), separate goal-auditor process, red-team the spec before deployment.

3. **Wallet Irreversibility + Prompt Injection** — malicious content injected via scraped web pages can reroute wallet transaction destinations; Solana transactions are irreversible. Prevention: signing service with per-tx and daily limits, private key never in agent-readable memory, prompt injection classifier on all external content, 80%+ of balance in cold wallet (agent operates on working capital only), all new strategies tested on Solana devnet before mainnet.

4. **Credential and Identity Sprawl** — agent-created accounts without an audit trail become unmanageable attack surface. Prevention: centralized append-only credential ledger, agent can request credentials be stored but cannot write directly, rate limit account creation (max 2-3 per service category per day), periodic human audit against the ledger.

5. **Context Poisoning in Long-Running Sessions** — stale/wrong beliefs accumulate over days, distorting all future planning; performance degrades non-linearly. Prevention: tiered memory (raw tool outputs never enter long-term storage), 24-hour consolidation cycle, confidence decay on facts, treat memory as the most valuable and most vulnerable asset.

6. **Browser Automation Detection** — modern bot detection (Cloudflare, PerimeterX) flags datacenter IPs and default browser fingerprints instantly. Prevention: residential proxy rotation before first real-account creation, unique fingerprint per identity persisted across sessions, gaussian-distributed timing delays, cooling-off after CAPTCHA challenges.

## Implications for Roadmap

Based on the combined research, the architecture's build order and the feature dependency graph, the following phase structure is strongly recommended. This order is not stylistic — each phase has hard dependencies on the previous.

### Phase 1: Foundation — Cognitive Loop + Safety Systems
**Rationale:** The goal-planner loop is the root of everything; kill switch and token budget governor are non-negotiable prerequisites before any capability; activity logging and cost tracking must exist from day one (cannot be retrofitted). This phase makes the agent "alive" and observable, even if it can't yet do anything useful.
**Delivers:** A running agent loop that can plan, execute basic tools, recover from crashes, and be safely stopped by the operator at any time.
**Addresses:** Goal-Planner Loop, Tool Execution Primitives, Persistent Memory, Crash Recovery, Kill Switch, Activity Logging, Operating Cost Tracking, Multi-Model AI Routing (basic)
**Avoids:** Token cost explosion (budget governor), goal drift (P&L tracking integrity established here), context poisoning (tiered memory architecture set here)
**Stack:** Mastra workflows, Vercel AI SDK, Drizzle ORM + Postgres, BullMQ, Pino, OpenTelemetry

### Phase 2: Financial Primitives — Wallet + Dashboard
**Rationale:** The agent's primary success metric is revenue > costs; wallet integration is needed before any revenue can exist; signing service with spend governance must exist before any external money-touching occurs. Dashboard is included here because the operator needs visibility before live funds are involved.
**Delivers:** Agent knows its balance, can send/receive SOL, all transactions are governed and audited, operator has a real-time window into agent decisions.
**Addresses:** Solana Wallet Integration, P&L Tracking, Web Dashboard (basic), Operating Cost Tracking (enriched with revenue data)
**Avoids:** Wallet irreversibility / prompt injection (signing service), goal drift via metric gaming (P&L is operator-managed)
**Stack:** @solana/kit, solana-agent-kit (basic), Hono, ws (WebSockets), signing service module
**Needs research:** Signing service architecture; dual-key wallet patterns on Solana (Helius has a guide, but implementation details for the TypeScript signing boundary warrant phase-level research)

### Phase 3: Interaction Capabilities — Browser + Identity
**Rationale:** Browser automation and identity management are tightly coupled (you need a browser to create accounts; you need accounts for most revenue strategies). Proxy infrastructure and fingerprinting must be in place before the agent creates any real accounts. Both are blocked on Phase 1 (tool layer must exist) and Phase 2 (credentials must be stored in vault, not agent memory).
**Delivers:** Agent can interact with any website, sign up for services autonomously, manage a credential vault, and create synthetic identities with an auditable ledger.
**Addresses:** Browser Automation, Identity Management, Credential Vault, Task Queue with Retry Logic (browser tasks are long-running and need async queue)
**Avoids:** Browser automation detection (proxy + fingerprint setup required here), credential sprawl (append-only ledger, rate limits on account creation)
**Stack:** Stagehand, Browserbase (remote sessions), BullMQ (async browser tasks), residential proxy service

### Phase 4: DeFi Integration — On-Chain Capabilities
**Rationale:** DeFi integration requires stable wallet integration (Phase 2) and a working strategy test-before-execute pattern. All DeFi strategies must run on Solana devnet before mainnet activation. Jupiter swaps, staking, and LP positions each have distinct risk profiles and integration complexity.
**Delivers:** Agent can execute DeFi strategies: token swaps (Jupiter), staking (Marinade), liquidity provision (Raydium/Orca), all with transaction simulation before mainnet execution.
**Addresses:** On-Chain DeFi Integration
**Avoids:** Wallet irreversibility (devnet staging before mainnet), cascading multi-model failures (structured schema on DeFi tool outputs before they enter planner context)
**Stack:** solana-agent-kit (full plugin suite), @jup-ag/api, @solana-agent-kit/plugin-defi, @solana-agent-kit/plugin-token
**Needs research:** Specific Jupiter Ultra V3 integration patterns; Marinade vs. native staking tradeoffs; impermanent loss modeling for LP positions

### Phase 5: Strategy Engine — Discovery and Portfolio Management
**Rationale:** Strategy discovery is the highest-complexity, lowest-confidence capability. It requires all previous phases (needs browser for web research, needs wallet for testing, needs DeFi for on-chain strategies). The correct approach is graduated: start with web research + hypothesis generation + small-scale testing, not full emergent discovery. Multi-strategy portfolio management follows naturally once two or more strategies are proven.
**Delivers:** Agent can identify revenue opportunities, test them at minimal capital, evaluate outcomes, scale winners, kill losers, and manage a portfolio of parallel strategies.
**Addresses:** Strategy Discovery, Multi-Strategy Portfolio, Strategy Evaluation
**Avoids:** Token cost explosion (research tasks must use cheap models), goal drift (strategy success measured against external observable outcomes, not agent-reported metrics)
**Stack:** Mastra workflow graph (strategy lifecycle), BullMQ (parallel strategy execution), multi-model routing (cheap models for research, Claude for synthesis)
**Needs research:** This entire phase warrants deep research during planning — no production system does emergent strategy discovery reliably; this is frontier territory with LOW confidence

### Phase 6: Self-Extension — Code Writer + Tool Registry
**Rationale:** Deferred until the core loop is proven profitable and the operator has established trust in the agent's judgment. Self-modifying code is the highest-risk capability; a code sandbox and atomic write pattern are required to prevent the agent from corrupting its own loop. Requires all prior phases to be stable.
**Delivers:** Agent can write TypeScript tools, test them in isolation, register them as available tools, and extend its own database schema — without operator involvement.
**Addresses:** Self-Extending Codebase, Schema Extension
**Avoids:** Self-written code corrupting the core loop (sandbox + test-before-deploy pattern), schema corruption (ALTER TABLE logged, destructive operations require confirmation)
**Stack:** tsx (TypeScript execution), Node.js child_process, Fly.io volume (generated code storage), Drizzle (schema extension)
**Needs research:** Safe code execution boundary within Fly.io VM; atomic schema extension patterns; rollback strategy for agent-written code that breaks existing tools

### Phase Ordering Rationale

- **Safety systems precede capability:** Kill switch, token budget governor, signing service, and tiered memory must exist before the capabilities that make them necessary. These cannot be retrofitted without resetting the agent.
- **Observability precedes autonomy:** Activity logging and dashboard come before strategy execution because you cannot trust what you cannot see. The operator must understand what the agent is doing before trusting it with live funds.
- **Financial governance before financial capability:** Signing service (Phase 2) before DeFi (Phase 4); wallet integration before strategy discovery.
- **Browser before identity:** You cannot create synthetic identities without a working browser automation layer with proxy and fingerprint infrastructure.
- **Stable base before self-modification:** Self-extending code (Phase 6) is gated on all prior phases being proven stable. A self-modifying agent on an unstable foundation amplifies instability.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Financial Primitives):** Signing service architecture — the specific implementation of a TypeScript-native signing service with spend governance on Solana has limited documentation; Helius guide is a starting point but implementation boundaries need deeper research
- **Phase 4 (DeFi Integration):** Jupiter Ultra V3 integration specifics; Marinade staking API; LP impermanent loss modeling in agent context; @solana/kit v6 transaction model compatibility with solana-agent-kit v2
- **Phase 5 (Strategy Engine):** This entire phase warrants dedicated research — emergent strategy discovery has LOW confidence and is acknowledged frontier territory; research should focus on what partial implementations have actually worked in production rather than what's theoretically possible
- **Phase 6 (Self-Extension):** Code sandbox safety within Fly.io; atomic TS execution with rollback; schema extension governance

Phases with standard patterns (research-phase likely not needed):
- **Phase 1 (Foundation):** Mastra, Vercel AI SDK, Drizzle, BullMQ are all well-documented with stable v1 APIs; goal-planner architecture has established patterns across multiple frameworks
- **Phase 3 (Interaction):** Stagehand is well-documented; Browserbase integration is first-class; identity management patterns are established in the browser automation literature

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified via npm registry; architectural choices supported by multiple credible sources; clear alternatives documented with explicit rationale |
| Features | MEDIUM-HIGH | Table stakes features have HIGH confidence (well-documented agent patterns); strategy discovery has LOW confidence (frontier territory, no reliable production implementations) |
| Architecture | MEDIUM-HIGH | Planner/executor/evaluator pattern is well-established; signing service design is well-supported by Helius; tiered memory pattern is documented in production AI agent systems |
| Pitfalls | HIGH | Multiple primary sources, post-mortems, 2025-era production failures; Anthropic primary source on reward hacking; Helius on Solana security; Fly.io official docs on restart policy |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Strategy discovery viability:** No production system reliably discovers profitable strategies from scratch. During Phase 5 planning, start with constrained discovery (web research + templates the agent can modify) rather than open-ended exploration. The goal is a working revenue loop, not proving the frontier capability.
- **Solana devnet staging workflow:** The specific workflow for staging all new strategies on devnet before mainnet needs to be designed during Phase 4 planning. This is a process question as much as a technical one.
- **Proxy and fingerprinting infrastructure:** The specific proxy service, cost, and integration pattern for browser automation needs validation during Phase 3 planning. Research identified the requirement; the specific provider (Bright Data, Oxylabs, etc.) was not validated.
- **solana-agent-kit v2 + Vercel AI SDK v6 compatibility:** STACK.md flags that `createVercelAITools` was verified for AI SDK 4.x; compatibility with SDK 6.x needs verification before Phase 4 begins.
- **Legal/ToS exposure for strategy categories:** PITFALLS.md flags legal gray areas for synthetic identity creation and certain automation patterns. Each discovered strategy category should be reviewed against ToS and applicable law before live execution is enabled. This is an ongoing operational requirement, not a one-time design decision.

## Sources

### Primary (HIGH confidence)
- npm registry (live) — all package versions verified via `npm view`
- [Helius: How to Build a Secure AI Agent on Solana](https://www.helius.dev/blog/how-to-build-a-secure-ai-agent-on-solana) — signing service, dual-key wallet architecture
- [Anthropic: Natural Emergent Misalignment from Reward Hacking](https://assets.anthropic.com/m/74342f2c96095771/original/Natural-emergent-misalignment-from-reward-hacking-paper.pdf) — goal drift patterns
- [CyberArk: AI Agents and Identity Risks](https://www.cyberark.com/resources/blog/ai-agents-and-identity-risks-how-security-will-shift-in-2026) — identity and credential security
- [Fly.io: Machine Restart Policy](https://fly.io/docs/machines/guides-examples/machine-restart-policy/) — deployment gotcha (`restart = always`)
- [Mastra docs](https://mastra.ai/docs) — agent orchestration framework
- [Vercel AI SDK docs](https://ai-sdk.dev/docs/introduction) — multi-model routing
- [Stagehand docs](https://docs.stagehand.dev) — browser automation
- [anza-xyz/kit GitHub](https://github.com/anza-xyz/kit) — Solana SDK v2
- [sendaifun/solana-agent-kit GitHub](https://github.com/sendaifun/solana-agent-kit) — DeFi agent toolkit
- [MongoDB: Why Multi-Agent Systems Need Memory Engineering](https://www.mongodb.com/company/blog/technical/why-multi-agent-systems-need-memory-engineering) — tiered memory architecture

### Secondary (MEDIUM confidence)
- [Towards Data Science: Why Your Multi-Agent System is Failing: 17x Error Trap](https://towardsdatascience.com/why-your-multi-agent-system-is-failing-escaping-the-17x-error-trap-of-the-bag-of-agents/) — flat swarm anti-pattern
- [Galileo: Hidden Costs of Agentic AI](https://galileo.ai/blog/hidden-cost-of-agentic-ai) — token cost explosion, multi-agent cascading failures
- [Restate: Durable AI Loops](https://www.restate.dev/blog/durable-ai-loops-fault-tolerance-across-frameworks-and-without-handcuffs/) — crash recovery patterns
- [Mastra v1 blog](https://mastra.ai/blog/mastrav1) — framework maturity
- [Browserbase: Stagehand v3](https://www.browserbase.com/blog/stagehand-v3) — browser automation performance
- [Bytebase: Drizzle vs Prisma 2025](https://www.bytebase.com/blog/drizzle-vs-prisma/) — ORM selection rationale
- [Crossmint: State of AI Agents on Solana](https://blog.crossmint.com/the-state-of-ai-agents-in-solana/) — Solana agent ecosystem
- [QuickNode: Jupiter Ultra Swap](https://www.quicknode.com/guides/solana-development/3rd-party-integrations/jupiter-ultra-swap) — swap routing

### Tertiary (LOW confidence — needs validation)
- Emergent strategy discovery sources — no production system reliably demonstrates this; academic papers and aspirational claims only
- Browser automation CAPTCHA solving accuracy claims — marketing-quality claims; assume this is an ongoing operational challenge, not a solved problem
- x402 agent-to-agent payments ecosystem size — early ecosystem, Solana 77% volume claim (Dec 2025) needs re-verification before any Phase 3+ dependency on this

---
*Research completed: 2026-02-18*
*Ready for roadmap: yes*
