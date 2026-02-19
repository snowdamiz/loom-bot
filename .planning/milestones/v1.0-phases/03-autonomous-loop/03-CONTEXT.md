# Phase 3: Autonomous Loop - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

The agent runs as a continuous goal-planner cycle: setting goals (operator-seeded or self-discovered), decomposing them into sub-goals, dispatching work through sub-agents, evaluating outcomes, replanning when needed, and surviving crashes without losing progress. Multiple independent main agents run concurrently. This phase does NOT include strategy discovery logic (Phase 7), wallet operations (Phase 4), or dashboard UI (Phase 5).

</domain>

<decisions>
## Implementation Decisions

### Goal-setting behavior
- Goals come from both operator injection and agent self-discovery
- When a goal is discovered or injected, a new independent main agent is spawned for it
- Multiple main agents run concurrently, independently, without communicating unless required
- Decomposition depth is Claude's discretion — the agent has sub-agent spawning as a tool and decides how granular to go based on the situation
- Priority between competing goals is agent-determined — the agent develops and tunes its own heuristic based on outcomes

### Replanning & divergence
- Dual detection: metric-based triggers for obvious failures (cost exceeded, retry exhaustion, criteria not met) + LLM evaluation for subtler divergence (outcome quality, unexpected results)
- Operator notified only on major replans (top-level goal changes or abandonment). Routine sub-goal replanning is logged but silent
- When replanning triggers, the agent evaluates whether in-progress work is still useful under the new plan — keeps what's relevant, aborts what's not
- Hard replan limit per goal, then escalate to operator. Goal is paused (not abandoned) pending operator decision

### Sub-agent orchestration
- Sub-agents receive scoped context — only what's relevant to their task. No visibility into parent's full state or sibling agents' work
- Per-main-agent concurrency cap on sub-agents. If the cap is reached, the main agent waits for a slot to open before spawning more
- Parent agent periodically checks in on sub-agent progress. If stuck, parent can intervene, re-scope, or kill the sub-agent
- All agents draw from a shared cost pool — no per-agent budget isolation

### Recovery & checkpointing
- Checkpoints at every sub-goal completion. If crash happens mid-sub-goal, replay from last completed sub-goal
- On crash recovery: Discord DM alert + dashboard indicator showing which agents restarted and what was affected
- Partially completed sub-goals are re-evaluated on recovery — agent checks if work is still valid, then resumes, retries, or replans
- Multiple main agents restart in staggered sequence (not all at once) managed by a supervisor to avoid resource spikes

### Claude's Discretion
- Goal decomposition depth and strategy per situation
- Priority heuristic design and evolution
- In-progress work evaluation criteria during replanning
- Sub-agent check-in frequency and intervention thresholds
- Specific checkpoint data structure and journal format
- Staggered restart timing and ordering logic

</decisions>

<specifics>
## Specific Ideas

- The agent should "just have the tools available to spawn agents as it sees fit" — sub-agent spawning is a first-class tool, not a special system mechanism
- Main agents are fully independent — "not necessarily talking to each other unless required"
- The system is designed around concurrent independent agents, not a single agent with sub-tasks

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-autonomous-loop*
*Context gathered: 2026-02-18*
