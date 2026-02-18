# Requirements: Jarvis

**Defined:** 2026-02-18
**Core Value:** The agent must be able to autonomously reason about opportunities, acquire the tools and accounts it needs, and execute money-making strategies without human intervention.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Agent Core Loop

- [x] **LOOP-01**: Agent sets high-level goals and decomposes them into sub-goals with dependencies
- [x] **LOOP-02**: Agent executes sub-goals by invoking tools and recording outcomes
- [x] **LOOP-03**: Agent evaluates outcomes against expectations and triggers replanning when divergent
- [x] **LOOP-04**: Agent runs continuous planning cycles without human intervention
- [x] **LOOP-05**: Agent prioritizes sub-goals based on expected value and current capabilities

### Multi-Agent Execution

- [x] **MULTI-01**: Main agent can spawn sub-agents to handle specific tasks concurrently
- [x] **MULTI-02**: Sub-agents have isolated LLM context focused on their assigned task
- [x] **MULTI-03**: Sub-agents report structured results back to the main agent on completion or failure
- [x] **MULTI-04**: Main agent can monitor sub-agent status and cancel running sub-agents
- [x] **MULTI-05**: Sub-agents share the same tool layer and database but have independent LLM sessions
- [x] **MULTI-06**: Main agent decides when to spawn a sub-agent vs execute inline based on task complexity and parallelism opportunity

### Tool Execution

- [x] **TOOL-01**: Agent can execute shell commands on the host VM
- [x] **TOOL-02**: Agent can make HTTP requests to external APIs and services
- [x] **TOOL-03**: Agent can read and write files on the host filesystem
- [x] **TOOL-04**: Agent can query and modify the Postgres database via Drizzle ORM
- [x] **TOOL-05**: Every tool call is logged before execution with input parameters
- [x] **TOOL-06**: Every tool call is checked against kill switch before execution
- [x] **TOOL-07**: Every tool call has a configurable timeout with graceful failure

### Multi-Model AI Routing

- [x] **MODL-01**: Agent routes LLM calls to different models based on task type
- [x] **MODL-02**: Each model call logs model used, input tokens, output tokens, and estimated cost
- [x] **MODL-03**: Complex reasoning tasks route to high-capability models (Claude Opus/Sonnet)
- [x] **MODL-04**: Simple classification and formatting tasks route to cheap models (Haiku/GPT-4o-mini)
- [x] **MODL-05**: Router supports adding new model providers without core changes

### Crash Recovery

- [x] **RECOV-01**: Agent journals each task step result before proceeding to the next step
- [x] **RECOV-02**: On restart, agent replays journal to resume from last checkpoint
- [x] **RECOV-03**: Agent survives Fly.io machine restarts without losing in-flight work
- [x] **RECOV-04**: Incomplete planning cycles are detected and replanned on recovery

### Persistent Memory

- [x] **DATA-01**: Agent state persists in Postgres across restarts
- [x] **DATA-02**: Agent can CREATE TABLE and ALTER TABLE to extend its own schema
- [x] **DATA-03**: Working memory (current cycle state) lives in LLM context window
- [x] **DATA-04**: Session memory (recent cycle summaries, active strategies) persists in Redis
- [x] **DATA-05**: Long-term memory (distilled facts, strategy history, credentials) persists in Postgres
- [x] **DATA-06**: Memory consolidation runs periodically to distill raw outputs into structured facts

### Task Queue

- [x] **QUEUE-01**: External calls retry with exponential backoff on transient failures
- [x] **QUEUE-02**: Exhausted retries move tasks to dead-letter queue for operator review
- [x] **QUEUE-03**: Task context is fully preserved across retries for deterministic replay
- [x] **QUEUE-04**: Scheduled and recurring tasks can be enqueued with cron-like timing
- [x] **QUEUE-05**: Long-running tasks (browser automation, web research) execute asynchronously

### Solana Wallet

- [x] **WALLET-01**: Agent can read its wallet balance (SOL and SPL tokens)
- [x] **WALLET-02**: Agent can send SOL and SPL tokens to specified addresses
- [x] **WALLET-03**: Agent can receive SOL and SPL tokens
- [x] **WALLET-04**: Private key never appears in LLM context, logs, or tool outputs
- [x] **WALLET-05**: Signing service enforces per-transaction and daily aggregate spending limits
- [x] **WALLET-06**: All transactions are logged with destination, amount, and stated purpose

### Operating Cost Tracking

- [x] **COST-01**: AI model API spend is tracked per call with model, tokens, and cost
- [x] **COST-02**: Total operating costs (VM, API, services) are aggregated and queryable
- [x] **COST-03**: Revenue is tracked per strategy with source attribution
- [x] **COST-04**: P&L (revenue minus costs) is computed and available via dashboard
- [x] **COST-05**: Agent can query its own P&L to inform planning decisions

### Kill Switch

- [x] **KILL-01**: Operator can activate kill switch via dashboard or direct database flag
- [x] **KILL-02**: Agent checks kill switch at the start of each planning cycle
- [x] **KILL-03**: When kill switch is active, agent halts all tool execution immediately
- [x] **KILL-04**: Kill switch state persists across agent restarts

### Activity Logging

- [x] **LOG-01**: Every agent decision is logged with timestamp and reasoning summary
- [x] **LOG-02**: Every tool call is logged with inputs, outputs, duration, and success/failure
- [x] **LOG-03**: Every planning cycle is logged with goals set, tasks completed, and outcomes
- [x] **LOG-04**: Logs are structured JSON and queryable via SQL
- [x] **LOG-05**: Audit log is append-only and immutable

### Web Dashboard

- [ ] **DASH-01**: Dashboard displays real-time agent status (alive, current goal, active strategy)
- [ ] **DASH-02**: Dashboard shows paginated activity feed (decisions, tool calls, outcomes)
- [ ] **DASH-03**: Dashboard shows P&L data with revenue, costs, and net over time
- [ ] **DASH-04**: Dashboard shows active and historical strategies with per-strategy P&L
- [ ] **DASH-05**: Dashboard includes kill switch control button
- [ ] **DASH-06**: Dashboard streams real-time updates via WebSocket connection
- [ ] **DASH-07**: Dashboard shows decision log with LLM reasoning for each major decision

### Self-Bootstrapping

- [ ] **BOOT-01**: Agent can install npm packages and system dependencies at runtime
- [ ] **BOOT-02**: Agent can discover, evaluate, and configure tools and services it needs
- [ ] **BOOT-03**: Agent can sign up for external services using browser automation
- [ ] **BOOT-04**: Agent requires zero operator intervention after initial deployment (except credential requests)

### Browser Automation

- [ ] **BROWSER-01**: Agent can select and install a browser automation library of its choice
- [ ] **BROWSER-02**: Agent can navigate to URLs and interact with page elements programmatically
- [ ] **BROWSER-03**: Agent can fill forms, click buttons, and extract structured content from pages
- [ ] **BROWSER-04**: Agent can handle CAPTCHA challenges via external solving service
- [ ] **BROWSER-05**: Browser sessions are tied to specific identities for session isolation

### Identity Management

- [ ] **IDENT-01**: Agent can create temporary email addresses for service signups
- [ ] **IDENT-02**: Agent can sign up for services using generated identities
- [ ] **IDENT-03**: Agent stores all credentials in an encrypted vault (Postgres)
- [ ] **IDENT-04**: Agent manages credential rotation and handles account bans gracefully
- [ ] **IDENT-05**: Agent can request human operator credentials when real identity is required
- [ ] **IDENT-06**: Identity ledger tracks all created accounts with service, status, and purpose

### Strategy Engine

- [ ] **STRAT-01**: Agent discovers potential money-making opportunities via web research
- [ ] **STRAT-02**: Agent generates hypotheses about profitable strategies from discovered opportunities
- [ ] **STRAT-03**: Agent tests strategies with minimal capital before committing larger amounts
- [ ] **STRAT-04**: Agent evaluates strategy performance against expectations and kills underperformers
- [ ] **STRAT-05**: Agent scales winning strategies by allocating more capital
- [ ] **STRAT-06**: Agent runs multiple strategies in parallel as independent goal trees
- [ ] **STRAT-07**: Per-strategy P&L is tracked independently with source attribution
- [ ] **STRAT-08**: Agent dynamically allocates capital across strategies based on performance

### Self-Extending Codebase

- [ ] **EXTEND-01**: Agent can write TypeScript code to create new tools and capabilities
- [ ] **EXTEND-02**: Agent tests generated code in a sandbox before deploying to production
- [ ] **EXTEND-03**: Agent-created tools register in the tool registry and become available for use
- [ ] **EXTEND-04**: Agent can extend its own database schema as its needs evolve
- [ ] **EXTEND-05**: Failed code deployments are rolled back without affecting the core agent loop

### Agent-to-Agent Economics

- [ ] **AGENT-01**: Agent can discover services available via x402 protocol
- [ ] **AGENT-02**: Agent can make micropayments to other agents/services for data or compute
- [ ] **AGENT-03**: Agent can offer its own capabilities as paid services via x402
- [ ] **AGENT-04**: All x402 transactions are logged and tracked in P&L

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### On-Chain DeFi Integration

- **DEFI-01**: Agent can swap tokens via Jupiter aggregator
- **DEFI-02**: Agent can provide liquidity on Raydium/Orca DEXs
- **DEFI-03**: Agent can stake SOL via Marinade or similar protocols
- **DEFI-04**: Agent simulates transactions before executing on mainnet
- **DEFI-05**: Agent understands and manages impermanent loss and slippage risk

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Human Approval Gates | Defeats 24/7 autonomy. Kill switch + observability is the safety model. |
| Predefined Strategy Library | Anchors agent thinking. Agent discovers strategies from first principles. |
| Multi-User Support | Single operator. Multi-tenancy is a v2+ business decision, not a v1 technical one. |
| Mobile App | Responsive web dashboard on mobile is sufficient. |
| Real-Time Streaming of Every Thought | Write amplification, expensive. Log at decision points, not every micro-step. |
| Flat Agent Swarm | 17x error amplification (DeepMind). Hierarchical multi-agent (main spawns focused sub-agents) is the architecture. |
| On-Chain Agent Logic | Smart contract execution is expensive and exposes strategy. Reasoning stays off-chain. |
| Complex Confidence Scoring | Adds latency to every decision. Binary action criteria instead. |
| External Content Filters | Project is explicitly unconstrained. Structural limits (kill switch, budget caps) instead. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TOOL-01 | Phase 1 | Complete |
| TOOL-02 | Phase 1 | Complete |
| TOOL-03 | Phase 1 | Complete |
| TOOL-04 | Phase 1 | Complete |
| TOOL-05 | Phase 1 | Complete |
| TOOL-06 | Phase 2 | Complete |
| TOOL-07 | Phase 1 | Complete |
| DATA-01 | Phase 1 | Complete |
| DATA-02 | Phase 1 | Complete |
| DATA-03 | Phase 1 | Complete |
| DATA-04 | Phase 1 | Complete |
| DATA-05 | Phase 1 | Complete |
| DATA-06 | Phase 1 | Complete |
| LOG-01 | Phase 1 | Complete |
| LOG-02 | Phase 1 | Complete |
| LOG-03 | Phase 1 | Complete |
| LOG-04 | Phase 1 | Complete |
| LOG-05 | Phase 1 | Complete |
| MODL-01 | Phase 2 | Complete |
| MODL-02 | Phase 2 | Complete |
| MODL-03 | Phase 2 | Complete |
| MODL-04 | Phase 2 | Complete |
| MODL-05 | Phase 2 | Complete |
| KILL-01 | Phase 2 | Complete |
| KILL-02 | Phase 2 | Complete |
| KILL-03 | Phase 2 | Complete |
| KILL-04 | Phase 2 | Complete |
| COST-01 | Phase 2 | Complete |
| COST-02 | Phase 2 | Complete |
| COST-03 | Phase 2 | Complete |
| COST-04 | Phase 2 | Complete |
| COST-05 | Phase 2 | Complete |
| MULTI-01 | Phase 3 | Complete |
| MULTI-02 | Phase 3 | Complete |
| MULTI-03 | Phase 3 | Complete |
| MULTI-04 | Phase 3 | Complete |
| MULTI-05 | Phase 3 | Complete |
| MULTI-06 | Phase 3 | Complete |
| LOOP-01 | Phase 3 | Complete |
| LOOP-02 | Phase 3 | Complete |
| LOOP-03 | Phase 3 | Complete |
| LOOP-04 | Phase 3 | Complete |
| LOOP-05 | Phase 3 | Complete |
| QUEUE-01 | Phase 3 | Complete |
| QUEUE-02 | Phase 3 | Complete |
| QUEUE-03 | Phase 3 | Complete |
| QUEUE-04 | Phase 3 | Complete |
| QUEUE-05 | Phase 3 | Complete |
| RECOV-01 | Phase 3 | Complete |
| RECOV-02 | Phase 3 | Complete |
| RECOV-03 | Phase 3 | Complete |
| RECOV-04 | Phase 3 | Complete |
| WALLET-01 | Phase 4 | Complete |
| WALLET-02 | Phase 4 | Complete |
| WALLET-03 | Phase 4 | Complete |
| WALLET-04 | Phase 4 | Complete |
| WALLET-05 | Phase 4 | Complete |
| WALLET-06 | Phase 4 | Complete |
| DASH-01 | Phase 5 | Pending |
| DASH-02 | Phase 5 | Pending |
| DASH-03 | Phase 5 | Pending |
| DASH-04 | Phase 5 | Pending |
| DASH-05 | Phase 5 | Pending |
| DASH-06 | Phase 5 | Pending |
| DASH-07 | Phase 5 | Pending |
| BROWSER-01 | Phase 6 | Pending |
| BROWSER-02 | Phase 6 | Pending |
| BROWSER-03 | Phase 6 | Pending |
| BROWSER-04 | Phase 6 | Pending |
| BROWSER-05 | Phase 6 | Pending |
| IDENT-01 | Phase 6 | Pending |
| IDENT-02 | Phase 6 | Pending |
| IDENT-03 | Phase 6 | Pending |
| IDENT-04 | Phase 6 | Pending |
| IDENT-05 | Phase 6 | Pending |
| IDENT-06 | Phase 6 | Pending |
| BOOT-01 | Phase 6 | Pending |
| BOOT-02 | Phase 6 | Pending |
| BOOT-03 | Phase 6 | Pending |
| BOOT-04 | Phase 6 | Pending |
| STRAT-01 | Phase 7 | Pending |
| STRAT-02 | Phase 7 | Pending |
| STRAT-03 | Phase 7 | Pending |
| STRAT-04 | Phase 7 | Pending |
| STRAT-05 | Phase 7 | Pending |
| STRAT-06 | Phase 7 | Pending |
| STRAT-07 | Phase 7 | Pending |
| STRAT-08 | Phase 7 | Pending |
| EXTEND-01 | Phase 8 | Pending |
| EXTEND-02 | Phase 8 | Pending |
| EXTEND-03 | Phase 8 | Pending |
| EXTEND-04 | Phase 8 | Pending |
| EXTEND-05 | Phase 8 | Pending |
| AGENT-01 | Phase 8 | Pending |
| AGENT-02 | Phase 8 | Pending |
| AGENT-03 | Phase 8 | Pending |
| AGENT-04 | Phase 8 | Pending |

**Coverage:**
- v1 requirements: 97 total
- Mapped to phases: 97
- Unmapped: 0

---
*Requirements defined: 2026-02-18*
*Last updated: 2026-02-18 after roadmap creation*
