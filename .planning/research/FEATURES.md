# Feature Research

**Domain:** Autonomous money-making AI agent (self-bootstrapping, goal-planner architecture)
**Researched:** 2026-02-18
**Confidence:** MEDIUM-HIGH (core agent patterns HIGH; Solana/DeFi specifics MEDIUM; emergent strategy claims LOW)

---

## Feature Landscape

### Table Stakes (Must Have — Agent Cannot Function Without These)

These are features the agent literally cannot operate without. Missing any = the agent either can't run or can't survive.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Goal-Planner Loop** | Core architectural requirement — without deliberate goal-setting and decomposition, the agent is just reactive tool use, not an autonomous agent | HIGH | Hierarchical: set goal → decompose into sub-goals → execute steps → evaluate outcome → replan. The loop is the agent's "cognitive engine." Research confirms planner-worker decomposition outperforms flat agent swarms. |
| **Tool Execution Primitives** | An agent that can only think but not act is useless. Shell, HTTP, filesystem, and DB access are the minimum action surface | MEDIUM | Shell exec, HTTP client, DB reads/writes, filesystem I/O. These are the "hands" of the agent. Everything else is bootstrapped on top of these. |
| **Persistent Memory (Postgres)** | Agent needs state between runs. Without persistence, every restart wipes all learned context, discovered strategies, and acquired credentials | LOW | Operator provides schema; agent extends it. Short-term = in-context working memory (LLM context window). Long-term = Postgres. Agent must be able to CREATE TABLE and ALTER TABLE autonomously. |
| **Crash Recovery / Resumable Execution** | 24/7 operation on Fly.io means the agent will crash. Without durability, a crash wipes in-flight work and the agent loses money | HIGH | Requires task journaling — record each step's result before proceeding to the next. On restart, replay journal to resume from last checkpoint. Durable execution pattern (Temporal/Restate style, but simpler). |
| **Multi-Model AI Routing** | No single model is optimal for all tasks. Cost/quality tradeoff is significant at 24/7 scale — routing cheap models to cheap tasks prevents burn rate from killing the project | MEDIUM | Claude for complex reasoning, GPT-4o-mini or similar for simple tasks, code-optimized models for code gen. Router must track cost per model call. |
| **Solana Wallet Integration** | The agent's "bank account." Cannot earn, spend, or bootstrap without the ability to check balance, send SOL, and sign transactions | MEDIUM | Read balance, send/receive SOL, interact with Solana programs. Solana Agent Kit (SendAI) covers 60+ pre-built actions. Private key must never appear in LLM context. |
| **Agent Activity Logging** | Without logs, there is no debugging, no audit trail, no way to understand what the agent did when something breaks or when it makes unexpected decisions | LOW | Structured logs: every decision, every tool call, every outcome. Must be queryable. This is the foundation of the dashboard. |
| **Operating Cost Tracking** | The success criterion is self-sustaining (revenue > costs). Without cost tracking, the agent cannot evaluate whether it's succeeding or failing | MEDIUM | Track: Fly.io VM cost, AI model API spend, any other service costs. Compare against revenue. P&L is the primary success metric. |
| **Kill Switch / Emergency Stop** | At 24/7 with no guardrails, a runaway agent can burn through wallet funds rapidly. There must be an operator-controlled halt mechanism | LOW | Simple: a flag in Postgres or a Fly.io machine stop command. The agent checks this flag at the start of each planning cycle. Does not require sophistication — just reliability. |
| **Task Queue with Retry Logic** | LLM APIs fail. External services fail. Without retry with backoff, every transient failure aborts the agent's current work | MEDIUM | Exponential backoff on external calls. Dead-letter queue for exhausted retries. Full context preserved per task so retries are deterministic. |

---

### Differentiators (Competitive Advantage — What Makes This Special)

These features separate Jarvis from a scripted trading bot or a pre-wired automation. They are what make the "digital organism" philosophy real.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Self-Bootstrapping Capability** | Agent installs its own dependencies, configures its own tools, signs up for its own services — needs zero operator intervention after initial deploy. This is the defining capability that makes Jarvis genuinely autonomous vs. a pre-wired bot | HIGH | Requires: shell exec (npm install, etc.), browser automation for signups, credential management for storing what it creates. The agent chooses what browser library to use, installs it, and uses it. Extremely rare in production systems. |
| **Browser Automation (Agent-Chosen)** | Agent can interact with any web UI — sign up for services, manage accounts, scrape dynamic content, interact with web-based APIs that have no SDK | HIGH | Agent selects the browser library (Playwright, Puppeteer, etc.), installs it, and operates it. Skyvern-style: can operate on sites it's never seen by mapping visual elements to actions. CAPTCHA handling is a real blocker — requires 2Captcha or similar. |
| **Identity Management (Synthetic Identities)** | Agent creates and manages its own email accounts, service accounts, and credentials. This is how it gets API keys without operator involvement | HIGH | Mailbox creation (temp mail services, or bot-created Gmail), CAPTCHA solving, credential storage in Postgres. The agent must manage rotation, avoid detection, and handle account bans gracefully. Legal gray area in some jurisdictions — document carefully. |
| **Strategy Discovery (No Predefined Playbook)** | Agent identifies profitable opportunities from scratch — no pre-coded strategies. This is what makes it potentially unbounded vs. a trading bot with fixed rules | VERY HIGH | Requires: web research capability, hypothesis generation, small-scale testing, evaluation, scaling winners. The agent must be able to reason "what could I do to make money?" and then try it. No existing system does this reliably — this is frontier territory. |
| **Self-Extending Codebase** | Agent writes, tests, and deploys its own code to expand its capabilities — can create new tools, new strategies, new integrations without operator involvement | VERY HIGH | Requires: code generation, test execution, safe deployment (staging → prod pattern). A runaway code-writing agent can break itself. Needs a "code sandbox" concept where new code is tested before becoming part of the core loop. |
| **Web Dashboard (Operator Observability)** | Real-time window into what the agent is doing, what it's earned, what decisions it's made. Makes the "digital organism" legible to its operator | MEDIUM | Activity feed, P&L chart, decision log with reasoning, live status. Not for the agent — for the human watching it. WebSocket or SSE for live updates. |
| **Multi-Strategy Portfolio** | Agent runs multiple strategies in parallel, allocating capital across them based on performance. Like a fund manager, not a single-strategy trader | HIGH | Requires: strategy tracking, per-strategy P&L, capital allocation logic. Each strategy is an independent goal tree. Strategies can be killed and replaced based on performance. |
| **On-Chain DeFi Integration** | Direct participation in Solana DeFi: staking, yield farming, liquidity provision, arbitrage across DEXs. These are programmatic, always-on revenue streams vs. web-scraping arbitrage which is fragile | HIGH | Jupiter for swaps, Raydium/Orca for LP, Marinade for staking. Higher signal/noise than web-scraping. But also more volatile. Agent must understand impermanent loss, slippage, etc. |
| **Agent-to-Agent Economics (x402/MCP)** | Agent can pay other agents or services micropayments via HTTP 402 protocol — buy data, compute, or capabilities on-demand. Future-proof architecture as the agent economy grows | HIGH | x402 protocol (Coinbase, open-sourced 2025). Solana dominates x402 volume (77% as of Dec 2025). Allows agent to acquire capabilities it wasn't bootstrapped with, without human involvement. |

---

### Anti-Features (Deliberately NOT Build)

Features that seem helpful but create more problems than they solve for this specific project.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Human Approval Gates** | Seems safer — operator reviews decisions before execution | Defeats the purpose. A 24/7 autonomous agent with approval gates is just a slow automation. Kills any time-sensitive opportunity. If you're watching it, you might as well do it yourself | Build good observability (dashboard + logs) so you can see what happened, and a kill switch so you can stop it. React after the fact, not before. |
| **Predefined Strategy Library** | "Just give it 10 good strategies to start" | Anchors the agent's thinking. An agent with predefined strategies becomes a strategy executor, not a strategy discoverer. Optimizes within the strategy space rather than exploring beyond it | Zero predefined strategies. Give it primitives and let it reason from first principles about what's profitable. The agent will find strategies a human wouldn't think to code. |
| **Multi-User Support** | "You could sell access to it" | Massive complexity increase (auth, isolation, billing, support). Distracts from the core goal: make the agent self-sustaining for one operator. Adding users before the agent is profitable is premature | Single-operator. If it works, multi-tenancy is a v2 business decision, not a v1 technical one. |
| **Mobile App** | Convenient monitoring on the go | Web dashboard viewed on mobile is sufficient. Native mobile app is 3-6 weeks of work that adds nothing to the agent's capability to make money | Responsive web dashboard. Done. |
| **Real-Time Everything** | Stream every agent thought to the dashboard in real time | LLM reasoning is expensive to stream. Constant DB writes for every micro-decision create write amplification. Latency of dashboard updates doesn't affect agent performance | Structured log writes at decision points (goal set, sub-goal decomposed, action taken, outcome recorded). Dashboard polls or uses SSE for status, not every thought. |
| **Flat Agent Swarm ("Bag of Agents")** | "More agents = more parallelism = more money" | DeepMind research: unstructured multi-agent systems create 17x error amplification. Without topological discipline (planner → workers), you scale noise, not intelligence | Hierarchical planner-worker architecture. One planner that decomposes goals and delegates. Workers that execute specific tasks. Clear accountability. |
| **Fully On-Chain Agent Logic** | "Put the agent on-chain for censorship resistance" | Smart contract execution is expensive and limited. LLM reasoning cannot run on-chain. On-chain = public strategy exposure, which destroys any edge | On-chain only for wallet operations (signing transactions). All reasoning happens off-chain in the TypeScript runtime. |
| **Complex Confidence Scoring / Self-Doubt Loops** | "Agent should assess confidence before acting" | Adds latency to every decision. At 24/7 operation, this compounds. Also: an agent that second-guesses itself constantly is an agent that does nothing | Clear action criteria: if within defined risk parameters (budget limit, position size cap), act. If outside parameters, escalate or abort. Binary, not probabilistic. |
| **External Guardrails / Content Filters** | "Filter out dangerous actions" | The project explicitly has no guardrails. Adding content filters after the fact creates adversarial dynamics (agent tries to route around them). Also, what's "dangerous" is context-dependent for a money-making agent | Operator-level kill switch. Per-cycle budget cap (max SOL spend per 24h). These are structural limits, not content filters. |

---

## Feature Dependencies

```
[Persistent Memory (Postgres)]
    └──required by──> [Agent Activity Logging]
    └──required by──> [Operating Cost Tracking]
    └──required by──> [Kill Switch]
    └──required by──> [Task Queue]
    └──required by──> [Identity Management] (credential storage)
    └──required by──> [Multi-Strategy Portfolio]

[Tool Execution Primitives]
    └──required by──> [Self-Bootstrapping Capability]
    └──required by──> [Browser Automation]
    └──required by──> [Self-Extending Codebase]

[Goal-Planner Loop]
    └──required by──> [Strategy Discovery]
    └──required by──> [Multi-Strategy Portfolio]
    └──required by──> [Self-Extending Codebase]
    └──required by──> everything else (it IS the agent)

[Browser Automation]
    └──required by──> [Identity Management]
    └──required by──> [Strategy Discovery] (web research, web-based revenue streams)

[Identity Management]
    └──required by──> [Strategy Discovery] (getting API keys for services)
    └──required by──> [Self-Bootstrapping Capability] (signing up for tools)

[Solana Wallet Integration]
    └──required by──> [Operating Cost Tracking]
    └──required by──> [On-Chain DeFi Integration]
    └──required by──> [Agent-to-Agent Economics]

[Crash Recovery]
    └──required by──> [24/7 Operation] (Fly.io)
    └──depends on──> [Task Queue] (durability requires queue + journal)
    └──depends on──> [Persistent Memory] (journal lives in Postgres)

[Agent Activity Logging]
    └──required by──> [Web Dashboard]
    └──required by──> [Operating Cost Tracking]

[Multi-Model AI Routing]
    └──enhances──> [Goal-Planner Loop] (cost efficiency at scale)
    └──enhances──> [Strategy Discovery] (different models for different reasoning tasks)
```

### Dependency Notes

- **Goal-Planner Loop is the root.** Everything else either feeds it or is produced by it. Build this first.
- **Persistent Memory unlocks almost everything.** Without Postgres, the agent resets on every restart — no learned strategies, no credentials, no cost tracking. Priority 0.
- **Browser Automation blocks Identity Management.** You cannot create email accounts or sign up for services without a browser. Identity Management cannot be built before Browser Automation works.
- **Self-Extending Codebase conflicts with Crash Recovery during development.** An agent writing its own code that then crashes mid-write and resumes can corrupt its codebase. The journal must track code-write operations atomically, or code changes must be sandboxed.
- **Kill Switch must be checked before Tool Execution Primitives fire.** Not after. If the agent checks the kill switch at the end of a goal cycle, it may have already spent funds or made external API calls that can't be undone.
- **Operating Cost Tracking depends on accurate AI model cost data.** Each model call must log: model used, input tokens, output tokens, cost per token. This requires the routing layer to emit cost events.

---

## MVP Definition

### Launch With (v1) — Minimal Viable Organism

The minimum needed to let the agent run, survive, and attempt to make money. The goal is not to make money in v1 — it's to have a living agent that can be observed and iterated on.

- [ ] **Goal-Planner Loop** — The agent must be able to set a goal, decompose it, and execute steps. Without this, nothing else matters.
- [ ] **Tool Execution Primitives** — Shell, HTTP, DB. The agent's hands. Non-negotiable.
- [ ] **Persistent Memory (Postgres)** — Agent state survives restarts. Non-negotiable.
- [ ] **Crash Recovery** — Fly.io will restart crashed machines. Agent must resume cleanly. Non-negotiable for 24/7.
- [ ] **Solana Wallet Integration** — Agent needs to know its balance and can send/receive. Even if it doesn't trade in v1, it needs wallet awareness.
- [ ] **Agent Activity Logging** — Structured logs for every decision and action. Required to understand what the agent is doing before trusting it with money.
- [ ] **Operating Cost Tracking** — Know the burn rate from day one. The success metric is revenue > costs.
- [ ] **Kill Switch** — A flag in Postgres the agent checks each cycle. Build it before giving the agent live funds.
- [ ] **Multi-Model AI Routing** — Basic version: route complex tasks to Claude, cheap tasks to a cheaper model. Prevents unexpected API bill spikes.
- [ ] **Web Dashboard (basic)** — Activity feed and current status. Not because the agent needs it, but because the operator needs to see it's alive and doing something coherent.

### Add After Validation (v1.x) — First Revenue Attempt

Once the agent is running stably and its decisions are legible:

- [ ] **Browser Automation** — Add once shell/HTTP primitives are proven. Trigger: agent has exhausted what it can do without a browser.
- [ ] **Identity Management** — Add once browser automation is working. Trigger: agent needs accounts to proceed with a strategy it's identified.
- [ ] **On-Chain DeFi Integration** — Add once wallet integration is stable. Trigger: agent wants to try DeFi strategies.
- [ ] **Task Queue with Retry Logic** — Add once the agent is making enough external calls that transient failures are causing visible disruption.

### Future Consideration (v2+) — Once It's Making Money

Defer these until the core loop is proven profitable:

- [ ] **Strategy Discovery (full emergent)** — The hardest problem. Start with the agent having web research + basic strategy templates it can modify, then graduate to full discovery. Trigger: agent is executing pre-seeded strategy ideas successfully.
- [ ] **Self-Extending Codebase** — High risk, high reward. Agent writes its own tools. Requires sandboxing. Trigger: agent is stable and the operator trusts its judgment.
- [ ] **Multi-Strategy Portfolio** — Only relevant once the agent has found more than one working strategy. Trigger: second profitable strategy identified.
- [ ] **Agent-to-Agent Economics (x402)** — Emerging protocol, small ecosystem. Trigger: agent identifies a service it can pay via x402 that meaningfully expands its capability.

---

## Feature Prioritization Matrix

| Feature | Agent Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Goal-Planner Loop | HIGH | HIGH | P1 |
| Tool Execution Primitives | HIGH | MEDIUM | P1 |
| Persistent Memory | HIGH | LOW | P1 |
| Crash Recovery | HIGH | MEDIUM | P1 |
| Kill Switch | HIGH | LOW | P1 |
| Agent Activity Logging | HIGH | LOW | P1 |
| Operating Cost Tracking | HIGH | LOW | P1 |
| Solana Wallet Integration | HIGH | MEDIUM | P1 |
| Multi-Model AI Routing | HIGH | MEDIUM | P1 |
| Web Dashboard (basic) | MEDIUM | MEDIUM | P1 |
| Browser Automation | HIGH | HIGH | P2 |
| Identity Management | HIGH | HIGH | P2 |
| Task Queue with Retry | MEDIUM | MEDIUM | P2 |
| On-Chain DeFi Integration | HIGH | HIGH | P2 |
| Strategy Discovery | HIGH | VERY HIGH | P2 |
| Multi-Strategy Portfolio | MEDIUM | HIGH | P3 |
| Self-Extending Codebase | HIGH | VERY HIGH | P3 |
| Agent-to-Agent Economics | MEDIUM | HIGH | P3 |
| Web Dashboard (advanced) | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch — agent cannot meaningfully operate without these
- P2: Should have — adds significant capability, needed for first revenue attempt
- P3: Nice to have — adds sophistication, defer until core is proven

---

## Competitor / Comparable System Analysis

This is not a traditional SaaS product with direct competitors. The closest comparables are:

| Feature | AutoGPT / BabyAGI | Traditional Crypto Bot | Jarvis Approach |
|---------|-------------------|-----------------------|-----------------|
| Strategy source | User-defined goals | Pre-coded rules | Agent-discovered from scratch |
| Tool acquisition | Pre-installed plugins | N/A | Self-bootstrapped (agent installs its own) |
| Identity / accounts | None | API keys provided by operator | Agent creates its own |
| Revenue model | None (research project) | Fixed strategy (e.g., grid trading) | Whatever the agent finds |
| Observability | Minimal | Varies | First-class dashboard + structured logs |
| Crash recovery | None | Usually none | Journaled execution |
| Self-modification | None | None | Agent writes its own code (v2+) |
| Financial autonomy | None | Read-only or narrow write | Full wallet control |

The key differentiator: **Jarvis is not a better trading bot. It's an agent that decides whether to trade at all, and if so, how.** The strategy discovery capability is what makes it categorically different from everything else.

---

## Confidence Assessment

| Claim | Confidence | Source |
|-------|------------|--------|
| Goal-planner loop as core architecture | HIGH | Verified across multiple agent framework sources; IBM, LangChain, academic papers all converge on planner-worker decomposition |
| Planner-worker outperforms flat swarm | HIGH | DeepMind research cited in multiple sources: 17x error amplification in unstructured multi-agent systems |
| Durable execution pattern (journal-based crash recovery) | HIGH | Temporal, Restate, DBOS documentation all describe same pattern; well-established in production |
| Solana Agent Kit (SendAI) for DeFi primitives | MEDIUM | GitHub repo exists and is actively maintained; 60+ actions claimed. Specific action coverage should be verified before building |
| x402 protocol for agent-to-agent payments | MEDIUM | Coinbase open-sourced in 2025; Solana 77% of volume claimed (Dec 2025). Ecosystem is early — verify current adoption before depending on it |
| Strategy discovery (agent finds profitable strategies from scratch) | LOW | No production system does this reliably. Research papers exist; AutoGPT attempted it; real-world results are inconsistent. This is genuinely frontier |
| Browser automation CAPTCHA solving accuracy | LOW | Claims of "high accuracy" in search results are unverified marketing. Assume this will be a recurring operational challenge |

---

## Sources

- [AI agent trends for 2026 — Salesmate](https://www.salesmate.io/blog/future-of-ai-agents/)
- [The AI Agent Tools Landscape 2026 — StackOne](https://www.stackone.com/blog/ai-agent-tools-landscape-2026)
- [Agentic AI Report 2026 — Nylas](https://www.nylas.com/agentic-ai-report-2026/)
- [Agentic AI comprehensive survey — arXiv](https://arxiv.org/html/2510.25445v1)
- [How Agentic AI Works — Kore.ai](https://www.kore.ai/blog/how-agentic-ai-works)
- [Defining Autonomous Enterprise: Reasoning, Memory, Core Capabilities — Unstructured.io](https://unstructured.io/blog/defining-the-autonomous-enterprise-reasoning-memory-and-the-core-capabilities-of-agentic-ai)
- [Why Your Multi-Agent System is Failing: 17x Error Trap — Towards Data Science](https://towardsdatascience.com/why-your-multi-agent-system-is-failing-escaping-the-17x-error-trap-of-the-bag-of-agents/)
- [The AI Agents Trap: Hidden Failure Modes — Unite.AI](https://www.unite.ai/the-ai-agents-trap-the-hidden-failure-modes-of-autonomous-systems-no-one-is-preparing-for/)
- [AI Agent Kill Switches — Pedowitz Group](https://www.pedowitzgroup.com/ai-agent-kill-switches-practical-safeguards-that-work/)
- [Trustworthy AI Agents: Kill Switches and Circuit Breakers — Sakura Sky](https://www.sakurasky.com/blog/missing-primitives-for-trustworthy-ai-part-6/)
- [Why AI Agents Need a Task Queue — LogRocket](https://blog.logrocket.com/ai-agent-task-queues/)
- [Durable AI Loops: Fault Tolerance — Restate](https://www.restate.dev/blog/durable-ai-loops-fault-tolerance-across-frameworks-and-without-handcuffs/)
- [AI Agent Observability — OpenTelemetry](https://opentelemetry.io/blog/2025/ai-agent-observability/)
- [Solana Agent Kit — SendAI GitHub](https://github.com/sendaifun/solana-agent-kit)
- [How to Build a Solana AI Agent — Alchemy](https://www.alchemy.com/blog/how-to-build-solana-ai-agents-in-2026)
- [Coinbase Launches Agentic Wallets — KuCoin](https://www.kucoin.com/news/flash/coinbase-launches-agentic-wallets-for-ai-agents-solana-follows-suit)
- [The State of AI Agents on Solana — Crossmint](https://blog.crossmint.com/the-state-of-ai-agents-in-solana/)
- [Browser-Use GitHub](https://github.com/browser-use/browser-use)
- [Skyvern-AI GitHub](https://github.com/Skyvern-AI/skyvern)
- [The Agentic AI Trading Bot — Medium / AI Simplified](https://medium.com/ai-simplified-in-plain-english/the-agentic-ai-trading-bot-revolutionizing-cryptocurrency-trading-with-autonomy-and-adaptivity-fe479dd43851)
- [Self-Improving Data Agents — PowerDrill](https://powerdrill.ai/blog/self-improving-data-agents)
- [Error Recovery in AI Agent Development — Gocodeo](https://www.gocodeo.com/post/error-recovery-and-fallback-strategies-in-ai-agent-development)

---

*Feature research for: Autonomous money-making agent (Jarvis)*
*Researched: 2026-02-18*
