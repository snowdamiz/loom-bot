# Phase 8: Self-Extension and Agent Economics - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

The agent can write its own TypeScript tools, test them in a sandbox, register them for use, extend its database schema, and participate in agent-to-agent economy via x402 micropayments. The agent is fully autonomous — it uses its seed goal and LLM reasoning to decide what tools to build, what services to buy/sell, and how to price them. No manual configuration of economic behavior.

</domain>

<decisions>
## Implementation Decisions

### Sandbox boundaries
- Isolation model is Claude's discretion (child process, VM, or in-process — research will determine best fit)
- Generated tools have full network access — no allowlisting or restrictions
- Generated tools can import any installed npm package (including packages installed at runtime via Phase 6 bootstrap)
- On crash/throw: catch and report error back to agent as tool result — agent decides whether to fix or abandon

### Tool lifecycle
- Auto-register immediately after passing sandbox tests — no operator approval gate
- Full mutation allowed — agent can update, replace, or delete any tool it previously created
- Tool source code persists to disk in a known directory, loaded on startup — survives restarts
- Agent can modify ALL tools including built-in ones (Phases 1-7), but built-in tool modifications must be tested in a staging sandbox using git branches first before applying to production code
- Generated-only tools (agent-authored) can be modified freely without staging

### Schema evolution rules
- Additive + soft destructive DDL: CREATE TABLE, ADD COLUMN, CREATE INDEX, ALTER COLUMN (type changes, defaults) — no DROP TABLE or DROP COLUMN
- Agent owns `agent_*` namespace freely (full control over agent-prefixed tables)
- Agent can ADD COLUMN to core tables but cannot do destructive changes to core schema
- Migration tracking mechanism is Claude's discretion (Drizzle vs separate agent_migrations table — research will determine)
- Failed schema changes auto-rollback inside a transaction — no partial state

### x402 / Agent economics
- x402 is a capability, not a configuration — the agent autonomously decides everything about its economic participation based on its seed goal
- Service discovery is AI-centric: agent uses its own LLM reasoning and browsing to find x402 services, not predefined registries
- Agent sets its own prices based on cost analysis and LLM reasoning
- Agent autonomously decides which capabilities to offer as paid services and which services to buy
- Payment method, negotiation, and all economic decisions are left entirely to the agent's LLM

### Claude's Discretion
- Sandbox isolation model (child process vs VM vs in-process)
- Migration tracking mechanism (Drizzle integration vs separate table)
- Rollback strategy for failed tool deployments
- Git branch workflow for built-in tool staging
- x402 protocol implementation details (headers, payment verification, endpoint structure)

</decisions>

<specifics>
## Specific Ideas

- "Built-in tools should be tested in staging using github branches in a sandbox first" — agent creates a branch, applies changes, runs tests, merges only on success
- "Make it AI centric instead of predefined" — no static registries or manual config for x402; the agent discovers and evaluates services through its own reasoning
- "AI decides everything based on its seed, nothing else needs to be mentioned to it" — the agent's seed goal drives all economic decisions; the phase provides the capability, not the strategy

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-self-extension-and-agent-economics*
*Context gathered: 2026-02-18*
