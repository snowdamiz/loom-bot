# Roadmap: Jarvis

## Overview

Jarvis is built in eight phases that follow a strict dependency chain: infrastructure first (tools, persistence, logging), then the cognitive backbone (AI routing, safety, cost tracking), then the autonomous loop (planning, execution, recovery), then financial capabilities (wallet, dashboard), then interaction capabilities (browser, identity, bootstrapping), then the strategy engine, and finally self-extension and agent economics. Each phase delivers a coherent, verifiable capability. Safety systems precede the capabilities that need them. Observability precedes autonomy. Financial governance precedes financial capability.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Infrastructure** - Tool primitives, persistent storage, and structured logging (completed 2026-02-18)
- [x] **Phase 2: AI Backbone and Safety** - Multi-model routing, kill switch, cost tracking (completed 2026-02-18)
- [x] **Phase 3: Autonomous Loop** - Goal-planner cycle, task queue, crash recovery (completed 2026-02-18)
- [x] **Phase 4: Wallet and Financial Governance** - Solana integration with signing service and spend limits (completed 2026-02-18)
- [ ] **Phase 5: Web Dashboard** - Operator visibility into agent decisions, status, and P&L
- [ ] **Phase 6: Browser, Identity, and Bootstrapping** - Web interaction, credential vault, self-provisioning
- [ ] **Phase 7: Strategy Engine** - Opportunity discovery, hypothesis testing, portfolio management
- [ ] **Phase 8: Self-Extension and Agent Economics** - Code generation, tool registry, x402 protocol

## Phase Details

### Phase 1: Infrastructure
**Goal**: The agent's hands and memory exist -- tools can execute against the host environment, results persist in the database, and every action is recorded in a structured audit trail
**Depends on**: Nothing (first phase)
**Requirements**: TOOL-01, TOOL-02, TOOL-03, TOOL-04, TOOL-05, TOOL-07, DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, LOG-01, LOG-02, LOG-03, LOG-04, LOG-05
**Success Criteria** (what must be TRUE):
  1. Operator can invoke shell commands, HTTP requests, file operations, and database queries through the tool layer and see results returned
  2. Tool calls that exceed their configured timeout fail gracefully with an error rather than hanging
  3. Agent state written to Postgres survives a process restart and is readable on recovery
  4. Redis contains session-level memory that is distinct from Postgres long-term storage
  5. Every tool invocation appears in the structured JSON log with timestamp, inputs, outputs, duration, and success/failure status
**Plans:** 4/4 plans complete

Plans:
- [x] 01-01-PLAN.md — Monorepo scaffold + @jarvis/db schemas + Docker Compose
- [x] 01-02-PLAN.md — @jarvis/logging audit trail + Redis session memory
- [x] 01-03-PLAN.md — Tool registry + shell/HTTP/file/DB tool implementations
- [x] 01-04-PLAN.md — Agent process wiring + BullMQ worker + memory consolidation

### Phase 2: AI Backbone and Safety
**Goal**: The agent can think using multiple AI models routed by task type, every action is gated by the kill switch, and all operating costs are tracked from the first API call
**Depends on**: Phase 1
**Requirements**: MODL-01, MODL-02, MODL-03, MODL-04, MODL-05, KILL-01, KILL-02, KILL-03, KILL-04, TOOL-06, COST-01, COST-02, COST-03, COST-04, COST-05
**Success Criteria** (what must be TRUE):
  1. A complex reasoning prompt routes to a high-capability model (Claude Opus/Sonnet) and a simple classification prompt routes to a cheap model (Haiku/GPT-4o-mini), with model selection logged
  2. Operator can activate the kill switch via database flag and all subsequent tool calls are immediately blocked
  3. Kill switch state persists across process restarts -- a restarted agent with active kill switch remains halted
  4. Every AI model call is logged with model name, token counts, and estimated cost, and these costs are queryable as aggregate totals
  5. Adding a new model provider does not require changes to the core routing logic
**Plans:** 3/3 plans complete

Plans:
- [ ] 02-01-PLAN.md — DB schemas (ai_calls, operating_costs, revenue, kill_switch_audit) + @jarvis/ai package (provider, router, kill switch, config)
- [ ] 02-02-PLAN.md — Kill switch CLI (jarvis kill/resume) + TOOL-06 gate + agent process wiring
- [ ] 02-03-PLAN.md — Credit balance monitoring + Discord DM alerts + P&L query functions

### Phase 3: Autonomous Loop
**Goal**: The agent runs as a continuous goal-planner -- setting goals, decomposing them, dispatching work through the task queue, evaluating outcomes, replanning when needed, and surviving crashes without losing progress. The main agent can spawn focused sub-agents for parallel task execution.
**Depends on**: Phase 2
**Requirements**: LOOP-01, LOOP-02, LOOP-03, LOOP-04, LOOP-05, MULTI-01, MULTI-02, MULTI-03, MULTI-04, MULTI-05, MULTI-06, QUEUE-01, QUEUE-02, QUEUE-03, QUEUE-04, QUEUE-05, RECOV-01, RECOV-02, RECOV-03, RECOV-04
**Success Criteria** (what must be TRUE):
  1. Agent autonomously sets a high-level goal, decomposes it into sub-goals with dependencies, and executes them in priority order without human prompting
  2. When a sub-goal outcome diverges from expectations, the agent detects the divergence and triggers replanning rather than continuing the original plan
  3. Failed external calls retry with exponential backoff, and exhausted retries appear in a dead-letter queue visible to the operator
  4. A scheduled task enqueued with cron-like timing fires at the specified interval across multiple planning cycles
  5. After a simulated crash (process kill), the agent restarts, replays its journal, and resumes from the last checkpoint without re-executing completed steps
  6. Main agent spawns a sub-agent for a specific task, the sub-agent executes with its own LLM context, and the main agent receives the structured result
  7. Main agent can run multiple sub-agents concurrently and aggregate their results
**Plans:** 6/6 plans complete

Plans:
- [ ] 03-01-PLAN.md — DB schema (goals + sub_goals) + AiProvider tool-calling protocol extension
- [ ] 03-02-PLAN.md — Agent core loop + GoalManager + LLM planner
- [ ] 03-03-PLAN.md — Sub-agent tools (spawn/await/cancel) + agent-tasks BullMQ worker
- [ ] 03-04-PLAN.md — BullMQ retry/DLQ/scheduler configuration
- [ ] 03-05-PLAN.md — Evaluator + Replanner + Supervisor + ResultCollector
- [ ] 03-06-PLAN.md — Journal checkpointing + crash recovery + agent process wiring

### Phase 4: Wallet and Financial Governance
**Goal**: The agent has a bank account on Solana with structural spend governance -- it can read balances, send and receive tokens, but never touches the private key, and every transaction is governed by limits and logged with its stated purpose
**Depends on**: Phase 3
**Requirements**: WALLET-01, WALLET-02, WALLET-03, WALLET-04, WALLET-05, WALLET-06
**Success Criteria** (what must be TRUE):
  1. Agent can query its SOL and SPL token balances and use the result in planning decisions
  2. Agent can send SOL to a specified address through the signing service, and the transaction is logged with destination, amount, and stated purpose
  3. A transaction exceeding the per-transaction or daily aggregate spending limit is rejected by the signing service before signing
  4. The wallet private key never appears in any LLM context window, log output, or tool call parameter
**Plans:** 3/3 plans complete

Plans:
- [x] 04-01-PLAN.md — DB schemas (wallet_transactions, spend_limits, wallet_config) + @jarvis/wallet package + IPC signing service
- [x] 04-02-PLAN.md — Balance reading (SOL + SPL tokens) + spend governance (per-tx + daily limits) + Discord notifications
- [x] 04-03-PLAN.md — SOL/SPL send pipeline + inbound monitoring + agent-facing wallet tools + process wiring

### Phase 5: Web Dashboard
**Goal**: The operator has a real-time window into everything the agent is doing -- live status, activity feed, P&L data, strategy history, decision reasoning, and a kill switch button
**Depends on**: Phase 4
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, DASH-07
**Success Criteria** (what must be TRUE):
  1. Dashboard displays the agent's current status (alive/halted, current goal, active strategy) and updates in real time without page refresh
  2. Operator can page through the activity feed showing agent decisions, tool calls, and outcomes in reverse chronological order
  3. Dashboard displays P&L data with revenue, costs, and net over time, broken down by strategy
  4. Operator can activate and deactivate the kill switch from the dashboard and see the agent halt/resume within seconds
  5. Decision log shows the LLM reasoning behind each major agent decision
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD
- [ ] 05-03: TBD

### Phase 6: Browser, Identity, and Bootstrapping
**Goal**: The agent can interact with any website, create and manage synthetic identities, store credentials securely, and provision its own tools and service accounts without operator involvement
**Depends on**: Phase 5
**Requirements**: BROWSER-01, BROWSER-02, BROWSER-03, BROWSER-04, BROWSER-05, IDENT-01, IDENT-02, IDENT-03, IDENT-04, IDENT-05, IDENT-06, BOOT-01, BOOT-02, BOOT-03, BOOT-04
**Success Criteria** (what must be TRUE):
  1. Agent can navigate to a URL, fill a form, click a submit button, and extract structured content from the resulting page
  2. Agent can create a temporary email address and use it to sign up for an external service via browser automation
  3. All credentials are stored in the encrypted vault in Postgres and are retrievable by the agent without exposing them in logs or LLM context
  4. The identity ledger tracks every created account with service name, status, and purpose, and the operator can audit it
  5. Agent can install an npm package at runtime and use it in subsequent tool calls without a restart or operator intervention
**Plans**: TBD

Plans:
- [ ] 06-01: TBD
- [ ] 06-02: TBD
- [ ] 06-03: TBD

### Phase 7: Strategy Engine
**Goal**: The agent discovers revenue opportunities through web research, generates and tests hypotheses with minimal capital, evaluates performance, scales winners, kills losers, and manages a portfolio of parallel strategies with independent P&L tracking
**Depends on**: Phase 6
**Requirements**: STRAT-01, STRAT-02, STRAT-03, STRAT-04, STRAT-05, STRAT-06, STRAT-07, STRAT-08
**Success Criteria** (what must be TRUE):
  1. Agent performs web research and produces a list of potential money-making opportunities with reasoning for each
  2. Agent allocates minimal capital to test a new strategy and evaluates its P&L against a predefined success threshold before scaling
  3. An underperforming strategy is automatically killed (no new capital allocated) based on its tracked P&L falling below threshold
  4. Multiple strategies run in parallel as independent goal trees, each with its own P&L tracked separately
  5. Agent dynamically reallocates capital from underperforming strategies to outperforming ones based on comparative performance
**Plans**: TBD

Plans:
- [ ] 07-01: TBD
- [ ] 07-02: TBD
- [ ] 07-03: TBD

### Phase 8: Self-Extension and Agent Economics
**Goal**: The agent can write its own TypeScript tools, test them safely, register them for use, extend its database schema, and participate in the agent-to-agent economy via x402 micropayments
**Depends on**: Phase 7
**Requirements**: EXTEND-01, EXTEND-02, EXTEND-03, EXTEND-04, EXTEND-05, AGENT-01, AGENT-02, AGENT-03, AGENT-04
**Success Criteria** (what must be TRUE):
  1. Agent writes a new TypeScript tool, tests it in a sandbox, and the tool appears in the tool registry available for use in subsequent planning cycles
  2. A failed code deployment is rolled back without affecting the running agent loop or existing tools
  3. Agent extends its own database schema (CREATE TABLE or ALTER TABLE) and the new schema is used in subsequent operations
  4. Agent discovers an x402 service, makes a micropayment, and receives data or compute in return, with the transaction logged in P&L
  5. Agent offers one of its own capabilities as a paid x402 service and receives payment from another agent
**Plans**: TBD

Plans:
- [ ] 08-01: TBD
- [ ] 08-02: TBD
- [ ] 08-03: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Infrastructure | 4/4 | Complete    | 2026-02-18 |
| 2. AI Backbone and Safety | 0/3 | Complete    | 2026-02-18 |
| 3. Autonomous Loop | 6/6 | Complete    | 2026-02-18 |
| 4. Wallet and Financial Governance | 3/3 | Complete   | 2026-02-18 |
| 5. Web Dashboard | 0/0 | Not started | - |
| 6. Browser, Identity, and Bootstrapping | 0/0 | Not started | - |
| 7. Strategy Engine | 0/0 | Not started | - |
| 8. Self-Extension and Agent Economics | 0/0 | Not started | - |
