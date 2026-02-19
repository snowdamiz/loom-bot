# Phase 8: Self-Extension - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

The agent can write its own TypeScript tools, test them in a sandbox, register them for use, and extend its database schema. If the agent needs additional capabilities (x402, agent economics, or anything else), it builds them itself using self-extension — we don't pre-build them.

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

### Claude's Discretion
- Sandbox isolation model (child process vs VM vs in-process)
- Migration tracking mechanism (Drizzle integration vs separate table)
- Rollback strategy for failed tool deployments
- Git branch workflow for built-in tool staging

</decisions>

<specifics>
## Specific Ideas

- "Built-in tools should be tested in staging using github branches in a sandbox first" — agent creates a branch, applies changes, runs tests, merges only on success
- x402, agent economics, and any other capabilities the agent needs are NOT pre-built — the agent uses self-extension to build them when its strategy requires it

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-self-extension-and-agent-economics*
*Context gathered: 2026-02-18*
