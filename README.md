# Jarvis

A fully autonomous money-making agent that runs 24/7. Given a database and multi-model AI access, it bootstraps everything else — including acquiring the tools, accounts, and integrations it needs.

## What This Is

Jarvis is an autonomous agent that reasons about opportunities, acquires tools and accounts, and executes strategies without human intervention. It operates as a persistent process that maintains its own goals, evaluates outcomes, and replans when strategies fail. There are no human approval gates in the normal execution path — the operator sets the kill switch and monitors via a dashboard.

The codebase is a Turborepo monorepo. Every subsystem is purpose-built: a goal-planner agent loop with multi-agent parallelism, Playwright browser automation with stealth and CAPTCHA solving, a strategy lifecycle engine, a self-extending tool system, and a real-time operator dashboard. An encrypted identity vault stores acquired credentials.

Version 1.0 satisfies all 93 v1 requirements and represents a complete MVP. The agent starts in an OFF state on first boot, requiring the operator to activate it via the dashboard after reviewing the seeded self-evolution goal.

## Architecture Overview

```
jarvis/
  apps/
    agent/       — Main agent process (goal loop, multi-agent supervisor, strategy engine, crash recovery)
    dashboard/   — Operator dashboard (Hono REST API + SSE streaming)
    cli/         — CLI tool (Commander.js)
  packages/
    db/          — Postgres via Drizzle ORM (22 schema tables)
    ai/          — Multi-model routing via OpenRouter (Claude/GPT/Grok tiers), cost monitoring
    browser/     — Playwright with stealth plugin, CAPTCHA solving (2captcha)
    tools/       — Agent tools (shell, HTTP, file, DB, browser, identity, self-extension)
    logging/     — Structured logging to Postgres
    typescript-config/ — Shared tsconfig
```

**Package dependency flow:**

```
typescript-config  (no deps)
     |
     db            (base layer — schema, pool, Drizzle client)
    / \
logging  ai        (logging: writes events to DB; ai: model routing, cost tracking)
browser            (standalone — Playwright lifecycle, stealth, CAPTCHA)
     \   |
      tools        (aggregates all packages into callable tool definitions)
       / | \
   agent dashboard cli   (apps that wire everything together)
```

## How It Works

**Goal-planner loop.** The agent maintains a goals table in Postgres. On each tick, the Supervisor spawns an `AgentLoop` for each active goal. The loop calls the LLM with all available tools, executes tool calls, appends results to the conversation, and continues until the goal is marked complete or the kill switch activates. A Evaluator periodically assesses whether goals are being achieved; a Replanner rewrites sub-goals when the current approach stalls.

**Multi-agent parallelism.** The main agent can spawn sub-agents via `spawn_agent`, dispatch them to a BullMQ worker queue, and await their results with `await_agent`. This lets the agent parallelize independent workstreams — researching opportunities while simultaneously setting up accounts.

**Strategy engine.** A domain-agnostic lifecycle state machine (`discovery → evaluation → execution → monitoring`) manages named strategies. The agent uses this to track long-running money-making approaches across restarts, without coupling the core loop to any specific domain.

**Self-extension.** The agent writes its own TypeScript tools at runtime using `tool_write`, compiles them with esbuild in a sandbox harness, and registers them immediately. Schema extensions via `schema_extend` let the agent add new Postgres tables when its built-in schema is insufficient. Authored tools persist across restarts and reload on boot.

**Kill switch.** The agent starts OFF on first boot — a kill switch record is written to the `agent_state` table before the supervisor loop begins. The operator activates the agent via the dashboard or by direct DB update. The kill switch state persists across restarts; the agent will not execute tool calls while it is active.

**Crash recovery.** A journal-based checkpoint system records goal progress to Postgres. On relaunch after an unclean shutdown, `detectCrashRecovery` reads active goals and `performStartupRecovery` resumes them through the Supervisor's staggered restart mechanism.

## Prerequisites

- Node.js >= 22
- pnpm 9.15.4 (managed via corepack)
- Docker (for Postgres 16 and Redis 7)
- OpenRouter API key (for AI model access)

## Quick Start

```bash
# 1. Clone and install
git clone <repo-url>
cd jarvis
corepack enable
pnpm install

# 2. Start infrastructure
pnpm docker:up    # Postgres 16 on :5433, Redis 7 on :6379

# 3. Configure environment
cp apps/agent/.env.example apps/agent/.env
# Edit .env with your API keys (see Environment Variables below)

# 4. Push database schema
pnpm db:push

# 5. Build all packages
pnpm build

# 6. Start the agent
pnpm --filter @jarvis/agent start

# 7. (Optional) Start the dashboard
pnpm --filter @jarvis/dashboard start
```

On first boot the agent writes the kill switch to Postgres and inserts a paused self-evolution seed goal. The agent will not take any actions until you activate it via the dashboard.

## Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DATABASE_URL` | Yes | Postgres connection string | `postgres://jarvis:jarvis@localhost:5433/jarvis` |
| `REDIS_URL` | Yes | Redis connection string | `redis://localhost:6379` |
| `OPENROUTER_API_KEY` | No | Fallback — prefer configuring via dashboard setup wizard | `sk-or-...` |
| `CREDENTIAL_ENCRYPTION_KEY` | No | AES key for identity credential vault | `openssl rand -hex 32` |
| `JARVIS_MODEL_STRONG` | No | Strong tier model override | `anthropic/claude-opus-4.6` |
| `JARVIS_MODEL_MID` | No | Mid tier model override | `anthropic/claude-sonnet-4.5` |
| `JARVIS_MODEL_CHEAP` | No | Cheap tier model override | `x-ai/grok-4.1-fast` |
| `DISCORD_BOT_TOKEN` | No | Discord bot token for operator notifications | — |
| `DISCORD_OPERATOR_USER_ID` | No | Discord user ID to receive DM alerts | — |
| `TWO_CAPTCHA_API_KEY` | No | 2captcha API key for CAPTCHA solving | — |
| `DASHBOARD_PORT` | No | Dashboard server port (default: 3001) | `3001` |
| `DASHBOARD_TOKEN` | Dashboard | Bearer token for dashboard API authentication | — |
Generate secrets with: `openssl rand -hex 32`

## Development

```bash
pnpm dev          # start all packages in watch mode
pnpm build        # build all packages
pnpm typecheck    # typecheck all packages
pnpm lint         # lint all packages
pnpm db:push      # push schema changes to database
pnpm db:generate  # generate Drizzle migrations
pnpm docker:up    # start Postgres + Redis containers
pnpm docker:down  # stop containers
```

Each package can also be run individually via `pnpm --filter @jarvis/<package> <script>`.

## Agent Tools

The agent starts with 20 tools registered. Domain-specific tools (wallet integrations, identity automation) can be added at runtime via `tool_write` or discovered via `tool_discover`.

**Primitives (4)**
- `shell` — Execute shell commands in a controlled subprocess
- `http` — Make HTTP requests with full header and body control
- `file` — Read, write, and manage files on the local filesystem
- `db` — Execute SQL queries against the Postgres database

**Multi-agent (3)**
- `spawn_agent` — Dispatch a sub-agent task to the BullMQ worker queue
- `await_agent` — Block until a spawned sub-agent job completes and return its result
- `cancel_agent` — Cancel a running sub-agent job

**Bootstrap (2)**
- `package_install` — Install npm packages into the tools workspace at runtime
- `tool_discover` — Scan the tool registry and report what is currently available

**Self-extension (3)**
- `tool_write` — Write a new TypeScript tool, compile it with esbuild, and register it immediately
- `tool_delete` — Remove an agent-authored tool from disk and the registry
- `schema_extend` — Add new tables or columns to the Postgres schema at runtime

**Browser (8)**
- `browser_session_open` — Launch a Chromium browser session with stealth mode
- `browser_session_close` — Close an existing browser session
- `browser_session_save` — Persist browser session cookies and storage to disk
- `browser_navigate` — Navigate to a URL and return page content
- `browser_click` — Click an element by CSS selector
- `browser_fill` — Fill a form field with a value
- `browser_extract` — Extract structured data from the current page
- `browser_screenshot` — Capture a screenshot of the current page

## Security Model

**Credential vault.** Service credentials acquired by the agent (API keys, account passwords) are encrypted with AES using `CREDENTIAL_ENCRYPTION_KEY` before being written to Postgres. The agent reads and writes credentials through the vault API; plaintext is never persisted.

**Kill switch.** The operator can halt all agent activity by activating the kill switch via the dashboard or a direct DB update to `agent_state` where `key = 'kill_switch'`. The `KillSwitchGuard` checks this state before every tool execution and before each agent loop tick. State persists across restarts.

**No approval gates by design.** Jarvis is built for full autonomy. The safety model is: kill switch for emergency stop and the dashboard for observability. There are no interactive approval prompts in the execution path.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Language | TypeScript |
| Monorepo | Turborepo + pnpm workspaces |
| Database | Postgres 16 + Drizzle ORM |
| Queue | Redis 7 + BullMQ |
| AI | OpenRouter (Claude, GPT, Grok) |
| HTTP | Hono |
| Browser | Playwright + stealth plugin |
| Build | esbuild (tool compilation), tsc (package builds) |
| Deployment | Docker Compose / Fly.io |

## Project Status

v1.0 MVP shipped 2026-02-19. All 93 v1 requirements satisfied.

Active development areas:
- On-chain DeFi integration (automated trading, liquidity provision)
- Dashboard frontend SPA (currently REST/SSE API only)
