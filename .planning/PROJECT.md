# Jarvis

## What This Is

A fully autonomous money-making agent that runs 24/7 on a Fly.io VM. Given a Solana wallet, a database, and multi-model AI access, it bootstraps everything else — browser automation, email accounts, API keys, service signups, strategies, tools. The v1.0 MVP delivers 12,394 LOC of TypeScript across 9 packages: a goal-planner agent loop with sub-agent parallelism, Solana wallet with IPC signing and spend governance, Playwright browser automation with stealth and CAPTCHA solving, encrypted identity vault, strategy engine with portfolio management, self-extending tool and schema system, and a real-time operator dashboard.

## Core Value

The agent must be able to autonomously reason about opportunities, acquire the tools and accounts it needs, and execute money-making strategies without human intervention.

## Current Milestone

**Version:** v1.1
**Name:** Self-Extension Safety and GitHub Control

**Goal:** Make self-extension production-safe by requiring real GitHub-backed version control and sandbox-gated promotion for all self-authored code changes.

**Target features:**
- Real GitHub OAuth connection (not stub) with repo selection and secure token handling
- Branch/commit/PR workflow for self-modifications, tied to the connected user repo
- Isolated sandbox test pipeline before merge/promotion
- Automatic rollback + operator-visible audit trail for every self-change

## Requirements

### Validated

- ✓ Goal-planner agent loop (set goals → decompose → execute → evaluate → replan) — v1.0
- ✓ Multi-agent execution (main agent spawns sub-agents for parallel task execution) — v1.0
- ✓ Multi-model AI backbone (route tasks to Claude, GPT, or other models via OpenRouter) — v1.0
- ✓ Solana wallet integration (read balance, send/receive SOL+SPL, IPC signing, spend governance) — v1.0
- ✓ Tool primitive system (shell, HTTP, filesystem, database access) — v1.0
- ✓ Self-bootstrapping capability (install packages, configure tools, set up services) — v1.0
- ✓ Browser automation (Playwright with stealth plugin and CAPTCHA solving) — v1.0
- ✓ Identity management (create email accounts, sign up for services, encrypted credential vault) — v1.0
- ✓ Persistent memory (Postgres + Redis, agent extends schema as needed) — v1.0
- ✓ Strategy discovery and execution (lifecycle state machine, portfolio context, domain-agnostic) — v1.0
- ✓ Web dashboard backend (REST API + SSE streaming, activity feed, P&L, kill switch) — v1.0
- ✓ Crash recovery (journal checkpointing, replay on restart) — v1.0
- ✓ Kill switch (operator halt via DB flag or dashboard, persists across restarts) — v1.0
- ✓ Operating cost tracking (per-call AI spend, P&L, strategy attribution) — v1.0
- ✓ Self-extension (agent writes TypeScript tools, sandbox testing, schema evolution) — v1.0

### Active

- [ ] Real GitHub OAuth + repo binding for self-extension operations
- [ ] Branch/PR based self-modification pipeline (no direct core writes on default branch)
- [ ] Sandbox promotion gate (compile + tests + smoke checks in isolated execution)
- [ ] Rollback + audit/observability for failed or risky self-modification attempts

### Out of Scope

- Human Approval Gates — defeats 24/7 autonomy; kill switch + observability is the safety model
- Predefined Strategy Library — anchors agent thinking; agent discovers strategies from first principles
- Multi-User Support — single operator; multi-tenancy is a v2+ business decision
- Mobile App — responsive web dashboard on mobile is sufficient
- Real-Time Streaming of Every Thought — write amplification; log at decision points
- Flat Agent Swarm — 17x error amplification (DeepMind); hierarchical multi-agent architecture
- On-Chain Agent Logic — smart contract execution is expensive and exposes strategy; reasoning stays off-chain
- Agent-to-Agent Economics (x402) — removed from v1; agent can build via self-extension if needed

## Context

Shipped v1.0 MVP with 12,394 LOC TypeScript across 128 files.
Tech stack: TypeScript, Turborepo, pnpm workspaces, Postgres 16, Redis 7, Drizzle ORM, BullMQ, Hono, OpenRouter (Claude/GPT/Grok), Playwright, @solana/web3.js.
Architecture: 9 packages — @jarvis/db, @jarvis/logging, @jarvis/tools, @jarvis/ai, @jarvis/wallet, @jarvis/browser, @jarvis/agent, apps/agent, apps/dashboard.
All 93 v1 requirements satisfied. v1.1 scope now focuses on hardening the self-extension path: GitHub-authenticated version control, isolated testing, and controlled promotion/rollback.

## Constraints

- **Language**: TypeScript — core agent and all bootstrapped code
- **Hosting**: Fly.io — VM-based deployment for persistent operation
- **Database**: Postgres — bootstrapped by operator, extended by agent
- **AI Models**: Multi-model routing via OpenRouter — Claude, GPT, Grok
- **Starting capital**: Solana wallet with SOL
- **Architecture**: Hierarchical multi-agent — main orchestrator spawns sub-agents for task execution

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript for core | Strong AI SDK ecosystem, good async story, Fly.io native support | ✓ Good — 12k LOC, clean monorepo |
| Goal-planner over ReAct | Agent needs long-horizon planning, not just reactive tool use | ✓ Good — goals → sub-goals → evaluate → replan works |
| Hierarchical multi-agent | Main agent spawns focused sub-agents instead of doing everything in one context | ✓ Good — sub-agents with scoped LLM contexts |
| Multi-model routing | Different tasks have different cost/quality tradeoffs | ✓ Good — strong/mid/cheap tiers via OpenRouter |
| No guardrails | Maximizes agent autonomy and opportunity space | — Pending (not yet deployed to production) |
| Postgres bootstrapped by operator | Agent needs reliable storage from minute one, can extend schema itself | ✓ Good — Drizzle ORM + agent DDL extension |
| Fly.io | Persistent VMs, good DX, reasonable cost for 24/7 operation | — Pending (not yet deployed) |
| OpenRouter via openai SDK | Compatible with OpenAI wire protocol, no custom HTTP client | ✓ Good — clean provider abstraction |
| IPC signing co-process | Private key never in LLM context; HMAC-SHA256 authenticated Unix socket | ✓ Good — structural key isolation |
| pnpm strict isolation | Forces explicit dependency declarations, prevents transitive import bugs | ✓ Good — caught many issues early |
| Append-only two-row audit pattern | LOG-05 compliance without UPDATE; immutable initial row + completion row | ✓ Good — clean audit trail |
| BullMQ for task queue | Retry, DLQ, scheduling, async execution on Redis | ✓ Good — reliable job processing |
| Domain-agnostic strategy engine | LLM decides strategy logic; StrategyManager is pure lifecycle + metadata | ✓ Good — no hardcoded strategy types |
| esbuild for self-extension compiler | Fast TypeScript compilation, in-memory transform | ✓ Good — sub-second tool compilation |

---
*Last updated: 2026-02-19 — started v1.1 milestone (Self-Extension Safety and GitHub Control)*
