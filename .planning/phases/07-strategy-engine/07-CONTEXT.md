# Phase 7: Strategy Engine - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Domain-agnostic strategy engine for managing long-lived autonomous goal pursuits. The agent discovers opportunities, tests hypotheses, evaluates outcomes, and manages a portfolio of parallel strategies. "Make money" is one possible goal — the engine handles any long-lived goal (monitoring, social media, research, etc.). No hard-coded strategy types or money-specific logic.

</domain>

<decisions>
## Implementation Decisions

### General-purpose architecture
- Strategy engine is domain-agnostic — works for any goal type, not just revenue
- No hard-coded strategy categories or money-specific code
- The agent uses LLM reasoning to discover, evaluate, pivot, and kill strategies in real time
- Strategies emerge from the agent's own analysis of its goal, not from predefined templates

### Opportunity scope
- Only constraint on what the agent can pursue: legality
- No allowlists, blocklists, or ethical filters beyond legal compliance
- Agent explores any legal opportunity that serves its seeded goal

### Risk appetite
- Each main agent has its own wallet balance, seeded by the operator
- Agent has full autonomy over capital allocation — can concentrate entire balance into one strategy
- Phase 4 spend limits (per-transaction and daily caps) are the only capital guardrails — no additional strategy-level limits
- When balance gets low, agent decides autonomously whether to pause, pivot to zero-capital work, or notify operator

### Strategy evaluation
- Agent uses LLM judgment to evaluate strategy health — no hard-coded P&L thresholds or auto-kill triggers
- No enforced limit on parallel strategies — agent decides concurrency based on its own assessment

### Operator interaction
- Goals seeded via dashboard (natural language)
- Operator intervenes by talking to the agent via chat, not mechanical dashboard buttons
- Kill switch remains the only mechanical override
- Full reasoning logs — every strategy decision logged with complete LLM reasoning (why pursued, pivoted, killed)

### Dashboard and reporting
- Aggregate view across all agents + drill-down per agent
- Per-strategy P&L attribution (costs + revenue) at the data model level
- Dashboard UI for viewing this data is NOT baked into Phase 7 — agent builds its own dashboard extensions via self-extension (Phase 8)

### Strategy lifecycle
- Claude's Discretion: lifecycle state definitions and transitions — Claude determines the right level of structure for strategy states

### Capability gaps
- When a strategy requires a capability the agent doesn't have, it builds it using Phase 8 self-extension
- Phase 7 assumes Phase 8 capabilities are available for the agent to extend itself

### Claude's Discretion
- Strategy lifecycle state definitions and transitions
- Concurrency management approach
- Internal data model for strategy tracking

</decisions>

<specifics>
## Specific Ideas

- "The bot has been pivoted into a general purpose bot. The human can spawn a main long lived bot that accomplishes everything it's been seeded to do."
- "Some agents will never truly finish — for example if an agent is told to 'make as much money as possible' it will never truly stop."
- "When I seed the bot initially I will tell it something like: [prompt], also add some dashboard UI to your dashboard to track this (self extension by the AI)"
- Agent should develop its own tools and make decisions for itself in real time — no need for dedicated pre-built strategy code

</specifics>

<deferred>
## Deferred Ideas

- **Real-time chat interface** with agents (dedicated chat windows where operator can talk to any main agent, spawn new ones) — extends Phase 5 Web Dashboard or its own phase
- **Multi-agent spawning from dashboard** — operator spawns new agents from UI

</deferred>

---

*Phase: 07-strategy-engine*
*Context gathered: 2026-02-18*
