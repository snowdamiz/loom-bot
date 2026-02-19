# Phase 2: AI Backbone and Safety - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Multi-model AI routing through OpenRouter, kill switch enforcement gating all agent operations, and cost tracking via OpenRouter's credit balance API. The agent can think using models routed by task type, is stoppable at any time, and monitors its own operating costs.

</domain>

<decisions>
## Implementation Decisions

### Model routing
- Three tiers: strong, mid, cheap
- Strong: `anthropic/claude-opus-4.6`, Mid: `anthropic/claude-sonnet-4.5`, Cheap: `x-ai/grok-4.1-fast`
- Model-to-tier mapping is runtime configurable (DB or config) — swap models without redeploying
- Callers can request a minimum tier (e.g., planning step requests "strong"), but the router picks the specific model
- All model calls logged with model name, token counts, and cost

### Kill switch
- Graceful wind-down: in-flight operations finish, no new ones start, agent completes current step then halts
- Blocks everything: tool calls AND AI model calls. Agent is fully frozen — can't think or act
- Activated via database flag + CLI commands (`jarvis kill` / `jarvis resume`) before dashboard exists (Phase 5)
- Every activation/deactivation requires a reason string logged to audit trail
- Kill switch state persists across process restarts

### Cost tracking
- All AI routed through OpenRouter — agent has its own OpenRouter account with prepaid credits
- No artificial spend limits — the prepaid credit balance is the natural limit
- Agent monitors its own OpenRouter credit balance via their API
- When credits run low, agent gracefully winds down current work
- Agent DMs operator on Discord (via bot) warning that credits need topping up
- Runs 24/7; operator tops up credits as needed (agent funds itself from earnings in later phases)

### Claude's Discretion
- Routing decision algorithm (task-type mapping, complexity scoring, or hybrid)
- Fallback behavior when a model/provider fails (retry vs fall to next provider)
- Cost tracking granularity (per-call, per-goal, or both)
- API key management approach (env var vs encrypted DB storage)
- Exact threshold for "credits running low" warning
- Discord bot setup details

</decisions>

<specifics>
## Specific Ideas

- OpenRouter model IDs are the source of truth for model selection (e.g., `anthropic/claude-opus-4.6`, not just "opus")
- Generic provider interface with OpenRouter as first implementation — abstracts over provider so direct API calls could be added later without refactoring the router
- Agent should be able to pull its own spend data from OpenRouter's API, not just estimate from token counts

</specifics>

<deferred>
## Deferred Ideas

- Context-length awareness: agent and sub-agents track context usage, at 80% they save state to DB and spin up a fresh agent to continue (avoids context rot) — Phase 3 (Autonomous Loop)

</deferred>

---

*Phase: 02-ai-backbone-and-safety*
*Context gathered: 2026-02-18*
