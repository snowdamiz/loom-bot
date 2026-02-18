# Jarvis

## What This Is

A fully autonomous money-making agent that runs 24/7 on a Fly.io VM. Given only a Solana wallet, a database, and multi-model AI access, it bootstraps everything else on its own — browser automation, email accounts, API keys, service signups, strategies, tools. No predefined behaviors beyond the core agent loop and primitive capabilities.

## Core Value

The agent must be able to autonomously reason about opportunities, acquire the tools and accounts it needs, and execute money-making strategies without human intervention.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Goal-planner agent loop (set goals → decompose → execute → evaluate → replan)
- [ ] Multi-agent execution (main agent spawns sub-agents for parallel task execution)
- [ ] Multi-model AI backbone (route tasks to Claude, GPT, or other models)
- [ ] Solana wallet integration (read balance, send/receive SOL, interact with DeFi)
- [ ] Tool primitive system (shell, HTTP, filesystem, database access)
- [ ] Self-bootstrapping capability (install packages, configure tools, set up services)
- [ ] Browser automation (agent selects and configures its own browser tooling)
- [ ] Identity management (create email accounts, sign up for services, manage credentials)
- [ ] Persistent memory (Postgres database, agent extends schema as needed)
- [ ] Strategy discovery and execution (no predefined strategies — agent finds opportunities)
- [ ] Web dashboard (activity feed, P&L tracking, decision log, live status)
- [ ] 24/7 operation on Fly.io with crash recovery

### Out of Scope

- Predefined trading strategies — the agent discovers its own
- Mobile app — web dashboard only
- Multi-user support — single operator (you)
- Spending limits or approval gates — fully unconstrained

## Context

The philosophy is "digital organism" — provide minimal primitives and let the agent self-organize. The initial codebase gives it just enough to think and act. Everything else (what browser library to use, what services to sign up for, what strategies to pursue) is the agent's decision.

Starting capital is a Solana wallet. The agent can use these funds however it chooses — trading, paying for services, funding infrastructure, or anything else it determines is profitable.

The agent should be able to write its own code, deploy it, set up databases, manage API keys — all without human involvement after initial deployment.

## Constraints

- **Language**: TypeScript — core agent and all bootstrapped code
- **Hosting**: Fly.io — VM-based deployment for persistent operation
- **Database**: Postgres — bootstrapped by operator, extended by agent
- **AI Models**: Multi-model routing — Claude, GPT, and others as the agent sees fit
- **Starting capital**: Solana wallet with SOL
- **Architecture**: Hierarchical multi-agent — main orchestrator spawns sub-agents for task execution, not a flat swarm

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript for core | Strong AI SDK ecosystem, good async story, Fly.io native support | — Pending |
| Goal-planner over ReAct | Agent needs long-horizon planning, not just reactive tool use | — Pending |
| Hierarchical multi-agent | Main agent spawns focused sub-agents instead of doing everything in one context | — Pending |
| Multi-model routing | Different tasks have different cost/quality tradeoffs | — Pending |
| No guardrails | Maximizes agent autonomy and opportunity space | — Pending |
| Postgres bootstrapped by operator | Agent needs reliable storage from minute one, can extend schema itself | — Pending |
| Fly.io | Persistent VMs, good DX, reasonable cost for 24/7 operation | — Pending |

---
*Last updated: 2026-02-18 after initialization*
