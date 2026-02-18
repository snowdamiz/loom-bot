# Phase 1: Infrastructure - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Tool execution primitives (shell, HTTP, file, DB), persistent storage (Postgres + Redis), and structured audit logging. The agent's hands, memory, and journal. No AI routing, no kill switch, no autonomous loop — those are later phases.

</domain>

<decisions>
## Implementation Decisions

### Tool access model
- Unrestricted root/sudo access on the host VM — the agent can do anything
- No constraints on tool execution before the kill switch (Phase 2) — tools run freely, timeout is the only limit (TOOL-07)
- Start with the four required tool types (shell, HTTP, file, DB) but build as a registry so the agent can create and register new tools as needed (supports Phase 8 self-extension)

### Memory boundaries
- Redis holds hot state only: current cycle state, active tool results, recent conversation turns. Losing Redis loses only the current session, not critical data
- Postgres is the source of truth for everything persistent
- Memory consolidation produces structured documents with context: what was learned, when, confidence level, source — a knowledge base, not key-value pairs
- The agent never forgets. All consolidated facts are permanent. Old facts can be marked stale but are never deleted

### Schema management
- No guardrails on schema changes. The agent can freely CREATE TABLE, ALTER TABLE, DROP TABLE. It owns the database

### Audit trail
- Log everything: full request/response bodies, complete shell output, full query results. Storage is cheap, missing data is not recoverable
- All logs stored in Postgres only — structured JSON, SQL-queryable, no separate file-based logging
- Log access through SQL only — no dedicated log query API. The agent uses the same DB tool for log queries
- Full LLM chain of thought captured per decision — complete reasoning, not just summaries. Feeds the dashboard's decision log (DASH-07) later

### Runtime and deployment
- Monorepo with packages (Turborepo/pnpm workspaces) — separate packages for core, tools, db, logging with clean boundaries
- Docker Compose for deployment — Postgres and Redis containers alongside the agent. Self-contained and portable
- Not locked to any cloud provider. Docker anywhere (VPS, Hetzner, DigitalOcean, Fly.io, etc.)
- Main process + worker architecture — main process runs the planning loop, separate workers handle long-running tools (browser, scraping). Communication via Redis/queue

### Claude's Discretion
- HTTP tool convenience features (JSON parsing, cookie jar, redirect following, response size limits)
- Exact Postgres schema design for logs, facts, and agent state
- Monorepo package boundaries and naming
- Worker process communication protocol
- Docker Compose service configuration

</decisions>

<specifics>
## Specific Ideas

- Tool registry should support the agent creating new tools later (Phase 8 requirement EXTEND-01 through EXTEND-03)
- Memory model: structured documents over simple key-value — the agent builds a knowledge base over time
- "Storage is cheap" philosophy — capture everything, filter later

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-infrastructure*
*Context gathered: 2026-02-18*
