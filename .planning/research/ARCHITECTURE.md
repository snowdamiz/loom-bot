# Architecture Research

**Domain:** Autonomous money-making AI agent (goal-planner, self-bootstrapping, TypeScript, Fly.io)
**Researched:** 2026-02-18
**Confidence:** MEDIUM-HIGH

---

## System Architecture

### Component Overview

```
                    ┌─────────────────────────────────────────┐
                    │              OPERATOR                     │
                    │         (Web Dashboard)                   │
                    └──────────────┬──────────────────────────┘
                                   │ WebSocket / REST
                    ┌──────────────▼──────────────────────────┐
                    │          DASHBOARD API                    │
                    │         (Hono server)                     │
                    └──────────────┬──────────────────────────┘
                                   │
    ┌──────────────────────────────┼──────────────────────────────┐
    │                         AGENT CORE                           │
    │  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
    │  │   PLANNER    │  │   EXECUTOR    │  │   EVALUATOR      │   │
    │  │ (Goal decomp │  │ (Tool calls,  │  │ (Outcome check,  │   │
    │  │  + strategy) │  │  sub-tasks)   │  │  replan trigger) │   │
    │  └──────┬───────┘  └──────┬────────┘  └──────┬───────────┘   │
    │         │                 │                   │               │
    │         └────────────┬────┴───────────────────┘               │
    │                      │                                        │
    │              ┌───────▼────────┐                               │
    │              │  MODEL ROUTER   │                               │
    │              │ (Vercel AI SDK) │                               │
    │              └───────┬────────┘                               │
    └──────────────────────┼──────────────────────────────────────┘
                           │
         ┌─────────────────┼────────────────────┐
         │                 │                    │
    ┌────▼────┐   ┌───────▼──────┐   ┌────────▼──────┐
    │ Claude  │   │    GPT-4o    │   │  Haiku / Mini  │
    │ (Plan)  │   │  (Research)  │   │   (Classify)   │
    └─────────┘   └──────────────┘   └───────────────┘

    ┌─────────────────────────────────────────────────────────────┐
    │                      TOOL LAYER                              │
    │  ┌──────────┐ ┌──────────┐ ┌────────┐ ┌──────────────────┐ │
    │  │  Shell   │ │  HTTP    │ │  File  │ │  Browser         │ │
    │  │  exec    │ │  client  │ │  I/O   │ │  (Stagehand)     │ │
    │  └──────────┘ └──────────┘ └────────┘ └──────────────────┘ │
    │  ┌──────────┐ ┌──────────┐ ┌──────────────────────────────┐│
    │  │  Wallet  │ │  DeFi    │ │  Code Writer                 ││
    │  │ (Signing │ │ (Solana  │ │  (Write + execute TS)        ││
    │  │  Service)│ │  Agent   │ │                               ││
    │  │          │ │  Kit)    │ │                               ││
    │  └──────────┘ └──────────┘ └──────────────────────────────┘│
    └─────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────┐
    │                    PERSISTENCE LAYER                         │
    │  ┌───────────────┐  ┌────────────┐  ┌───────────────────┐  │
    │  │   Postgres     │  │   Redis    │  │   Fly Volume      │  │
    │  │ (State, memory │  │ (BullMQ,   │  │ (Ephemeral files, │  │
    │  │  credentials,  │  │  cache,    │  │  generated code)  │  │
    │  │  audit log)    │  │  sessions) │  │                   │  │
    │  └───────────────┘  └────────────┘  └───────────────────┘  │
    └─────────────────────────────────────────────────────────────┘
```

---

## Component Boundaries

### 1. Agent Core (Planner → Executor → Evaluator)

The heart of the system. Implements the goal-planner loop:

**Planner:**
- Receives high-level goal ("make money")
- Decomposes into sub-goals using LLM reasoning
- Prioritizes based on expected value and current capabilities
- Outputs a task tree with dependencies

**Executor:**
- Takes individual tasks from the planner
- Invokes tools via the Tool Layer
- Reports results back to evaluator
- Handles tool failures with retry/fallback

**Evaluator:**
- Assesses outcomes against expected results
- Triggers replanning when outcomes diverge from expectations
- Updates agent memory with learned outcomes
- Manages the planning cycle cadence

**Boundary:** Planner never calls tools directly. Executor never reasons about strategy. Evaluator never executes. Clean separation prevents the agent from conflating planning with execution.

### 2. Model Router (Vercel AI SDK)

Routes LLM calls to appropriate models based on task type:

| Task Type | Model | Rationale |
|-----------|-------|-----------|
| Strategic planning | Claude Opus/Sonnet | Best reasoning for decomposition |
| Web research | GPT-4o | Good at summarization and extraction |
| Classification | Claude Haiku / GPT-4o-mini | Fast, cheap, sufficient |
| Code generation | Claude Sonnet | Strong code quality |
| Tool call formatting | Any cheap model | Structured output only |

**Boundary:** The router sits between Agent Core and LLM providers. All model calls go through the router. The router logs every call with model, tokens, cost.

### 3. Tool Layer

All agent actions on the external world go through registered tools:

| Tool | Interface | External Dependency |
|------|-----------|---------------------|
| Shell | `child_process.exec` | OS |
| HTTP | `fetch` | Internet |
| File I/O | `fs` | Fly Volume |
| Browser | Stagehand API | Chromium + Browserbase |
| Wallet | Signing Service API | Solana RPC |
| DeFi | Solana Agent Kit tools | Solana protocols |
| Code Writer | Write TS + `tsx` exec | Node.js runtime |
| Database | Drizzle ORM | Postgres |

**Boundary:** Every tool call is:
1. Logged to the audit table (before execution)
2. Checked against kill switch (before execution)
3. Wrapped in a timeout
4. Result stored in execution journal

### 4. Signing Service

Separates wallet private key from agent tool surface:

```
Agent ──request──> Signing Service ──sign──> Solana RPC
                        │
                   [Enforces:]
                   - Per-tx limit
                   - Daily aggregate limit
                   - Destination whitelist
                   - Purpose logging
```

**Boundary:** The agent never sees the private key. The signing service is a separate module (could be a separate process) that holds the key and enforces spending governance.

### 5. Memory System (Tiered)

```
┌──────────────────────────────────────────┐
│  Working Memory (LLM context window)      │
│  - Current planning cycle state           │
│  - Active task details                    │
│  - Recent tool outputs (current cycle)    │
│  TTL: Single planning cycle               │
├──────────────────────────────────────────┤
│  Session Memory (Redis)                   │
│  - Compressed summaries of recent cycles  │
│  - Active strategy states                 │
│  - Browser session data                   │
│  TTL: Hours to days                       │
├──────────────────────────────────────────┤
│  Long-term Memory (Postgres)              │
│  - Distilled facts (not raw outputs)      │
│  - Strategy performance history           │
│  - Credential references                  │
│  - Audit log (immutable)                  │
│  TTL: Permanent                           │
└──────────────────────────────────────────┘
```

**Boundary:** Raw tool outputs never enter long-term memory. Only structured, distilled facts with timestamps. Memory consolidation runs every 24 hours.

### 6. Dashboard API

Hono HTTP server exposing:

- `GET /api/status` — Agent health, current goal, active strategies
- `GET /api/activity` — Paginated activity feed (decisions, tool calls, outcomes)
- `GET /api/pnl` — P&L data (revenue, costs, net)
- `GET /api/strategies` — Active and historical strategies
- `POST /api/kill` — Activate kill switch
- `WS /ws/feed` — Real-time activity stream

**Boundary:** Dashboard is read-only except for kill switch. Agent writes to shared Postgres tables; dashboard reads them. No bidirectional control (except kill).

### 7. Task Queue (BullMQ)

Handles asynchronous work:

- Scheduled strategy scans (cron-like)
- Browser automation tasks (long-running)
- Retry failed external calls
- Periodic memory consolidation

**Boundary:** The planner enqueues work. Workers dequeue and execute. Results flow back through the evaluation loop.

---

## Data Flow

### Planning Cycle (Main Loop)

```
1. Check kill switch (Postgres flag)
2. Load working context:
   - Current goals from long-term memory
   - Active strategy states from session memory
   - Recent outcomes from last cycle
3. PLAN: LLM generates/updates task tree
   - Model: Claude Sonnet/Opus via router
   - Output: Prioritized task list
4. EXECUTE: For each task in priority order:
   a. Select tool
   b. Execute with timeout
   c. Log to audit table
   d. Store result in working memory
5. EVALUATE: LLM assesses outcomes
   - Did tasks achieve sub-goals?
   - Any new information to store?
   - Should strategy be adjusted?
6. Update memories:
   - Distilled facts → long-term (Postgres)
   - Compressed cycle summary → session (Redis)
   - Clear working memory for next cycle
7. Schedule next cycle (BullMQ delayed job)
```

### Revenue Flow

```
Strategy Discovery → Strategy Evaluation → Small Test → Scale/Kill
     │                      │                    │           │
     ▼                      ▼                    ▼           ▼
 Web research          LLM analysis         Execute with   Track P&L
 Browse opportunities  Risk assessment      minimal capital per strategy
 Identify patterns     Expected ROI         Measure actual Kill losers
                                            results        Scale winners
```

### Identity/Account Flow

```
Strategy needs service → Check credential vault → Exists? Use it
                                                → Missing? Create:
                                                  1. Browser → temp email
                                                  2. Browser → service signup
                                                  3. Extract API key
                                                  4. Store in vault (Postgres)
                                                  5. Log in identity ledger
```

---

## Build Order (Dependencies)

### Phase 1: Foundation
**Must build first — everything depends on this**

1. **Postgres schema + Drizzle ORM** — All state lives here
2. **Agent loop skeleton** (Mastra workflow) — The heartbeat
3. **Model router** (Vercel AI SDK) — Agent needs to think
4. **Tool primitives** (shell, HTTP, file, DB) — Agent needs to act
5. **Kill switch** — Safety before capability
6. **Activity logging** — Observability before autonomy
7. **Cost tracking** — Know the burn rate immediately

### Phase 2: Financial Primitives
**Agent needs money awareness**

1. **Signing service** — Wallet access with governance
2. **Solana wallet integration** — Balance, send, receive
3. **P&L tracking** — Revenue vs. costs dashboard data

### Phase 3: Interaction Capabilities
**Agent needs to reach the outside world**

1. **Browser automation** (Stagehand) — Interact with any website
2. **Identity management** — Create accounts, manage credentials
3. **Credential vault** — Secure storage for agent-created credentials

### Phase 4: DeFi Integration
**On-chain capabilities**

1. **Solana Agent Kit** — 60+ DeFi actions as LLM tools
2. **Jupiter integration** — Swap routing
3. **Transaction simulation** — Test before executing on mainnet

### Phase 5: Strategy Engine
**The agent's brain for finding opportunities**

1. **Strategy discovery** — Web research + hypothesis generation
2. **Strategy evaluation** — Risk/reward analysis
3. **Strategy execution** — Small test → scale/kill pattern
4. **Multi-strategy portfolio** — Run multiple strategies in parallel

### Phase 6: Self-Extension
**Agent writes its own tools**

1. **Code sandbox** — Write TS, test, deploy safely
2. **Tool registry** — Agent-created tools become available tools
3. **Schema extension** — Agent adds tables/columns as needed

### Phase 7: Resilience & Scale
**Hardening for 24/7 operation**

1. **Task queue** (BullMQ) — Async work with retries
2. **Memory consolidation** — 24hr tiered cleanup
3. **Crash recovery** — Journal-based resumption
4. **Health monitoring** — Heartbeat + alerts

### Phase 8: Dashboard
**Operator window into the agent**

1. **Hono API server** — REST endpoints
2. **WebSocket feed** — Real-time activity
3. **Frontend** — Activity feed, P&L charts, strategy view, kill switch

---

## Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Single planner, multiple executors | Prevents conflicting strategies; one brain, many hands |
| Signing service separate from agent | Private key isolation; spending governance; audit trail |
| Tiered memory (not flat context) | Prevents context rot; controls costs; enables 24/7 operation |
| Tools checked against kill switch pre-execution | Agent can't bypass safety after deciding to act |
| P&L tracking is operator-managed, agent read-only | Prevents agent from gaming its own success metric |
| Browser automation behind identity management | Each browser session tied to a specific identity for isolation |
| Code sandbox with test-before-deploy | Self-written code can't crash the core agent loop |
| BullMQ over Temporal | Single-VM deployment; no separate orchestration server needed |

---

## Sources

- [Google Cloud: Choose a design pattern for agentic AI](https://docs.google.com/architecture/choose-design-pattern-agentic-ai-system) — Supervisor + Worker pattern, event-driven coordination
- [IBM: Why observability is essential for AI agents](https://www.ibm.com/think/insights/ai-agent-observability) — Decision logs, traces, metrics
- [Solana Agent Kit](https://github.com/sendaifun/solana-agent-kit) — DeFi tool integration architecture
- [C3 AI: Autonomous Coding Agents](https://c3.ai/blog/autonomous-coding-agents-beyond-developer-productivity/) — Self-extending code architecture
- [Browserbase/Stagehand](https://docs.stagehand.dev) — AI-native browser automation
- [Vercel AI SDK](https://ai-sdk.dev/docs/introduction) — Multi-model routing, Agent abstraction
- [Mastra](https://mastra.ai/docs) — Graph-based workflow engine for TypeScript agents
- [Helius: How to Build a Secure AI Agent on Solana](https://www.helius.dev/blog/how-to-build-a-secure-ai-agent-on-solana) — Dual-key wallet architecture

---
*Architecture research for: Jarvis — autonomous TypeScript AI agent*
*Researched: 2026-02-18*
