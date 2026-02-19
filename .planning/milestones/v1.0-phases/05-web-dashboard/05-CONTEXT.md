# Phase 5: Web Dashboard - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Minimal operator dashboard providing live agent status, activity feed, kill switch control, and password-protected access. The dashboard is intentionally minimal — the agent will extend it by modifying source code in Phase 8 (Self-Extension). P&L visualization, charts, and strategy breakdowns are excluded; the agent builds those for itself when it needs them.

</domain>

<decisions>
## Implementation Decisions

### Layout & navigation
- Tabbed single-page app — tabs switch between views, no sidebar
- Default landing tab is an overview summary with compact cards: agent status, recent activity snippet, kill switch
- Clean, minimal visual style — light/neutral theme, generous whitespace, card-based (Linear/Vercel aesthetic)
- Kill switch lives on the overview tab only, not pinned globally

### Activity feed
- Compact one-liner entries by default: icon + timestamp + short summary
- Click to expand for full details (inputs, outputs, duration, cost)
- Entries grouped by goal/sub-goal — shows structure of what the agent is working on
- Live streaming — new entries appear at the top as they happen, no manual refresh
- Full text search plus type filters (tool calls, AI decisions, wallet transactions, errors)

### Kill switch & controls
- Overview tab shows: alive/halted status, current goal, uptime, last action timestamp, active strategy
- Kill switch with confirmation dialog ("Are you sure? This will halt all agent activity.")
- Resume button with same confirmation pattern
- No other operator controls beyond status display and kill/resume — keep it minimal

### Authentication
- Password/token-protected access — prevents unauthorized kill switch use
- Simple auth gate, not a full user system

### Claude's Discretion
- Frontend framework choice (React, Svelte, etc.)
- Real-time transport mechanism (WebSocket, SSE, polling)
- Exact tab structure beyond overview and activity
- Loading states and error handling patterns
- Typography, spacing, color palette within the clean/minimal constraint
- How authentication token is configured and validated

</decisions>

<specifics>
## Specific Ideas

- Dashboard should be a foundation the agent can later modify via source code changes (Phase 8) — no plugin architecture needed, just clean well-structured code
- "The AI should decide how and when to build P&L features for itself" — the shipped dashboard is deliberately incomplete
- Minimal viable operator tool: can I see what it's doing, and can I stop it?

</specifics>

<deferred>
## Deferred Ideas

- P&L visualization (revenue, costs, net over time, strategy breakdown) — agent builds this itself via Phase 8 self-extension
- Chat window to talk to the main agent — new capability, future phase
- Create and manage multiple main agents from dashboard — new capability, future phase
- Strategy history and decision reasoning views — agent extends dashboard when strategy engine exists (Phase 7+)

</deferred>

---

*Phase: 05-web-dashboard*
*Context gathered: 2026-02-18*
