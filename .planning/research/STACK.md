# Stack Research

**Domain:** Autonomous AI money-making agent (TypeScript, Fly.io, multi-model LLM, Solana wallet, browser automation)
**Researched:** 2026-02-18
**Confidence:** MEDIUM-HIGH (versions verified via npm; architectural decisions verified via multiple credible sources)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| TypeScript | 5.9.3 | Core language | Strict typing prevents runtime errors in financial logic; required by project constraints; best AI SDK ecosystem support |
| Node.js | 22.x LTS | Runtime | LTS stability for 24/7 operation; Fly.io has first-class Node.js support; Corepack for package management |
| `ai` (Vercel AI SDK) | 6.0.90 | Multi-model LLM routing | Unified API across Claude/GPT/Gemini; `prepareStep` for mid-workflow model switching; `Agent` abstraction in v6; 20M monthly downloads; only TypeScript-first multi-provider SDK with this maturity |
| `@ai-sdk/anthropic` | 3.0.45 | Claude provider | Official Anthropic provider for Vercel AI SDK |
| `@ai-sdk/openai` | 3.0.29 | GPT provider | Official OpenAI provider for Vercel AI SDK |
| `@mastra/core` | 1.4.0 | Agent orchestration framework | TypeScript-native, built by Gatsby team, 220k+ weekly downloads, v1 stable since Nov 2025; graph-based workflow engine; supports goal-planner pattern via workflows + agents; native Postgres storage adapter |
| `mastra` (CLI) | 1.3.1 | Scaffold and dev tooling | Dev server, deployment helpers, evals |

### Browser Automation

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Stagehand (`stagehand`) | 1.0.1 | AI-native browser automation | Primary browser control; TypeScript-first; `act()`, `extract()`, `observe()`, `agent()` primitives; self-healing against DOM changes; model-agnostic (Claude, GPT, Gemini); v3 rewritten on CDP (44% faster) |
| `@playwright/test` | 1.58.2 | Playwright core (Stagehand dependency) | Low-level fallback when Stagehand's AI overhead is unnecessary; direct CDP access for scripted flows |
| Browserbase (cloud) | SaaS | Remote browser sessions at scale | When running multiple parallel browser sessions or needing session replay/captcha solving; Stagehand integrates natively; Series B company processing 50M sessions in 2025 |

**Note on browser-use:** Python-only library; not usable in this TypeScript stack. Stagehand is its TypeScript equivalent.

### Solana / DeFi

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@solana/kit` | 6.1.0 | Solana SDK (v2 architecture) | All on-chain interactions: SOL transfers, balance checks, transaction construction; tree-shakable, zero dependencies, TypeScript-native; replaces legacy `@solana/web3.js` v1 |
| `solana-agent-kit` | 2.0.10 | High-level DeFi agent toolkit | 60+ Solana actions (swaps, staking, lending, NFTs) wired as LLM tools; plugin architecture; integrates with Vercel AI SDK via `createVercelAITools` |
| `@solana-agent-kit/plugin-defi` | 2.0.8 | DeFi operations plugin | Jupiter swaps, lending, staking, perpetuals |
| `@solana-agent-kit/plugin-token` | 2.0.9 | Token operations plugin | SPL transfers, bridging |
| `@jup-ag/api` | 6.0.48 | Jupiter swap API client | Direct Jupiter integration for swap routing when more control than solana-agent-kit is needed; Jupiter Ultra V3 achieves sub-1s settlement |

### Database & Storage

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `drizzle-orm` | 0.45.1 | ORM for Postgres | TypeScript-first, code-first schema definition; agent can write and extend table definitions as plain TS; no DSL to parse; significantly faster than Prisma v1 for server-side use cases |
| `drizzle-kit` | 0.31.9 | Migration tooling for Drizzle | Generate and run SQL migrations |
| `postgres` | 3.4.8 | Postgres driver | Native postgres driver; used by Drizzle; more ergonomic than `pg` for modern TypeScript |
| `ioredis` | 5.9.3 | Redis client | BullMQ dependency; session caching; ephemeral state |

**Why Drizzle over Prisma:** Agent needs to extend its own schema at runtime. Drizzle schema is plain TypeScript — the agent can write new table definitions and migration files without needing to parse Prisma's custom DSL. Prisma 7 is now pure TypeScript (no Rust engine) but still requires `.prisma` DSL. Drizzle is also faster with no native binary.

### Task Queue & Workflow

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `bullmq` | 5.69.3 | Job queue (Redis-backed) | Background task dispatch: scheduled strategy runs, browser tasks, webhook processing; simpler than Temporal; Redis only |

**Why BullMQ over Temporal:** Jarvis runs on a single Fly.io VM. Temporal requires running a separate Temporal server (Cassandra or Postgres backend) — significant operational overhead for a solo deployment. BullMQ backed by a Fly.io Redis instance achieves retries, concurrency control, and priority queuing with zero extra infrastructure. Upgrade to Temporal if/when the agent architecture genuinely needs durable multi-step saga workflows spanning hours.

### Web Server & Dashboard API

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `hono` | 4.11.9 | HTTP server for dashboard API | Lightweight, TypeScript-first, runs on Node.js and edge runtimes; 3x faster than Express in benchmarks; first-class TypeScript support; used for dashboard REST API and WebSocket feeds |

### Observability & Logging

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pino` | 10.3.1 | Structured logging | 5x faster than Winston; JSON output by default; async I/O; standard for high-throughput Node.js services |
| `@opentelemetry/sdk-node` | 0.212.0 | Distributed tracing | Trace agent decisions, LLM calls, tool invocations; correlates with Pino logs via trace IDs |
| `@opentelemetry/instrumentation-pino` | 0.58.0 | Pino-OTel bridge | Injects `trace_id`/`span_id` into Pino log records for log-trace correlation |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | 4.3.6 | Schema validation | Validate LLM tool call inputs/outputs; validate API responses; Vercel AI SDK requires Zod for tool schemas |
| `dotenv` | 17.3.1 | Environment config | Load secrets from `.env` for local dev (Fly.io secrets handle production) |
| `ws` | 8.19.0 | WebSocket server | Real-time dashboard updates (activity feed, P&L stream) |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `tsx` 4.21.0 | TypeScript execution without compile step | Run `.ts` files directly in development; faster iteration than `ts-node` |
| ESLint + `typescript-eslint` | Static analysis | Catch type errors and anti-patterns before runtime |
| `vitest` | Testing | Fast native TypeScript test runner; compatible with Vite ecosystem |
| `flyctl` CLI | Fly.io deployment | `flyctl deploy`, `flyctl secrets set`, `flyctl logs` |

---

## Installation

```bash
# Core agent framework + LLM routing
npm install @mastra/core ai @ai-sdk/anthropic @ai-sdk/openai

# Browser automation
npm install stagehand

# Solana + DeFi
npm install @solana/kit solana-agent-kit @solana-agent-kit/plugin-defi @solana-agent-kit/plugin-token @jup-ag/api

# Database
npm install drizzle-orm postgres ioredis

# Task queue
npm install bullmq

# Web server
npm install hono

# Observability
npm install pino @opentelemetry/sdk-node @opentelemetry/instrumentation-pino

# Utilities
npm install zod dotenv ws

# Dev dependencies
npm install -D typescript tsx drizzle-kit @playwright/test vitest eslint typescript-eslint
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Mastra | LangChain.js | If you need mature Python ecosystem parity (LangGraph, more RAG tooling); Mastra is faster-moving and more TypeScript-idiomatic |
| Mastra | Raw Vercel AI SDK only | If the agent's planning logic is simple enough that a framework overhead isn't worth it; Jarvis's goal-planner architecture needs workflow orchestration that Mastra provides |
| Stagehand | Playwright directly | For scripted, deterministic browser flows where LLM overhead is wasteful; use Playwright's API directly via Stagehand's `.page` escape hatch |
| Stagehand | browser-use | If switching to Python; browser-use is Python-only and maps to Stagehand conceptually |
| `@solana/kit` | `@solana/web3.js` v1 | Never — v1 is in maintenance mode; only use v1.x if a third-party dependency forces it |
| Drizzle ORM | Prisma | If the team prefers a schema-first DSL and automated migrations; Prisma 7 is now pure TS. For agent-written schema extensions, Drizzle is still better |
| BullMQ | Temporal | When agent workflows become multi-hour sagas requiring durable execution (e.g., waiting on external callbacks); add Temporal as a separate concern if/when needed |
| Hono | Fastify | If you need a larger plugin ecosystem or schema-first API validation; Hono is lighter and sufficient for an internal dashboard |
| Hono | Express | Express is a 2010-era framework; do not use for new projects in 2025 |
| Pino | Winston | Never — Winston is 5x slower and provides no additional value |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@solana/web3.js` v1 | Maintenance-only; supply chain attack occurred (1.95.6/1.95.7 malicious versions); superseded by `@solana/kit` | `@solana/kit` |
| browser-use | Python-only; no TypeScript support | Stagehand |
| Puppeteer | Chrome-only; no AI integration; requires manual stealth setup; inferior to Playwright on which Stagehand is built | Stagehand (wraps Playwright/CDP) |
| Selenium | 2004-era tech; slow WebDriver protocol; no TypeScript-first support | Stagehand |
| Winston | 5x slower than Pino; no structured JSON by default; higher memory footprint | Pino |
| Express.js | Unmaintained API patterns; no TypeScript-first support; slowest of the modern options | Hono |
| Prisma (for agent schema) | Schema defined in `.prisma` DSL — agent cannot write/extend schema as TypeScript; requires code generation step | Drizzle ORM |
| LangChain.js | Python-first; JS port lags behind; heavier abstraction than Mastra; agent lock-in risk | Mastra |
| CrewAI | Python-only | Mastra multi-agent workflows |
| AutoGPT | Python; unmaintained; prototype-quality only | Mastra |
| Temporal (at start) | Requires operating a separate Temporal server; over-engineered for single-VM deployment | BullMQ |

---

## Stack Patterns by Variant

**Agent loop (goal-planner):**
- Use Mastra `Workflow` graph for planning steps (decompose → execute → evaluate → replan)
- Use Mastra `Agent` with Vercel AI SDK tools for individual task execution
- Use BullMQ to schedule periodic strategy scans and retry failed tasks
- Use `prepareStep` in Vercel AI SDK to route to Claude Opus for planning, Claude Haiku/GPT-4o-mini for cheap tool calls

**Browser automation (agent-driven):**
- Use Stagehand `agent()` for open-ended tasks ("sign up for this service")
- Use Stagehand `act()` / `extract()` for targeted sub-tasks within a workflow
- Use Playwright `.page` directly (via Stagehand's escape hatch) for scripted, known-stable interactions
- Use Browserbase remote sessions when running multiple parallel browser tasks

**Solana operations:**
- Use `solana-agent-kit` with `createVercelAITools` to expose DeFi actions as LLM-callable tools
- Use `@solana/kit` directly for low-level transaction construction and signing
- Use Jupiter Ultra API (`@jup-ag/api`) for swap routing with MEV protection (Beam relayer)

**Self-bootstrapping code execution:**
- The agent can write TypeScript files to disk and execute them via `tsx` child processes
- Use Node.js `child_process.exec` / `execa` for shell commands
- Do NOT use E2B or other sandbox services on Fly.io — the VM IS the sandbox; Fly.io provides OS-level isolation already
- Persist generated code/tools to Postgres so they survive restarts

**Dashboard (web observability):**
- Hono serves REST API + WebSocket endpoint
- WebSocket (`ws`) streams real-time activity feed, P&L, decision log to browser
- Static dashboard HTML served from Hono or as a separate Fly.io app

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `@solana/kit` 6.x | `@jup-ag/api` 6.x | Verify transaction type compatibility — `@solana/kit` uses a different tx model than web3.js v1; Jupiter API docs confirm support |
| `solana-agent-kit` 2.x | `ai` (Vercel AI SDK) 4.x+ | `createVercelAITools` is the integration point; verify against ai SDK 6.x (may need ai 5.x import paths) |
| Stagehand 1.0.x | `@playwright/test` 1.58.x | Stagehand ships Playwright as a peer dependency; do not install conflicting Playwright versions |
| Mastra 1.x | Drizzle ORM 0.45.x | Mastra has native Postgres storage adapter; can coexist with Drizzle but use separate connection pool |
| BullMQ 5.x | ioredis 5.x | BullMQ requires ioredis 5.x; compatible |
| `ai` SDK 6.x | `@ai-sdk/anthropic` 3.x | Always update provider packages together with core `ai` package |
| TypeScript | 5.9.x | Node.js 22 LTS; use `"module": "node16"` or `"nodenext"` in tsconfig |

---

## Sources

- **Vercel AI SDK** — `npm view ai version` → 6.0.90; [ai-sdk.dev/docs](https://ai-sdk.dev/docs/introduction); [vercel.com/blog/ai-sdk-6](https://vercel.com/blog/ai-sdk-6)
- **Mastra** — `npm view @mastra/core version` → 1.4.0; [mastra.ai/docs](https://mastra.ai/docs); [mastra.ai/blog/mastrav1](https://mastra.ai/blog/mastrav1) (v1 beta Nov 2025)
- **Stagehand** — `npm view stagehand version` → 1.0.1; [docs.stagehand.dev](https://docs.stagehand.dev); [browserbase.com/blog/stagehand-v3](https://www.browserbase.com/blog/stagehand-v3)
- **@solana/kit** — `npm view @solana/kit version` → 6.1.0; [github.com/anza-xyz/kit](https://github.com/anza-xyz/kit); [helius.dev blog on Web3.js 2.0](https://www.helius.dev/blog/how-to-start-building-with-the-solana-web3-js-2-0-sdk)
- **solana-agent-kit** — `npm view solana-agent-kit version` → 2.0.10; [docs.sendai.fun](https://docs.sendai.fun/); [github.com/sendaifun/solana-agent-kit](https://github.com/sendaifun/solana-agent-kit)
- **Jupiter** — `npm view @jup-ag/api version` → 6.0.48; [dev.jup.ag](https://dev.jup.ag/); [quicknode.com Jupiter Ultra Swap guide](https://www.quicknode.com/guides/solana-development/3rd-party-integrations/jupiter-ultra-swap)
- **Drizzle ORM** — `npm view drizzle-orm version` → 0.45.1; [bytebase.com Drizzle vs Prisma 2025](https://www.bytebase.com/blog/drizzle-vs-prisma/)
- **BullMQ** — `npm view bullmq version` → 5.69.3; [dragonflydb.io BullMQ guide 2025](https://www.dragonflydb.io/guides/bullmq)
- **Hono** — `npm view hono version` → 4.11.9; [betterstack.com Hono vs Fastify](https://betterstack.com/community/guides/scaling-nodejs/hono-vs-fastify/)
- **Pino** — `npm view pino version` → 10.3.1; [signoz.io pino-logger guide](https://signoz.io/guides/pino-logger/)
- **Playwright MCP** — [github.com/microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp); [playwright MCP comprehensive guide](https://medium.com/@bluudit/playwright-mcp-comprehensive-guide-to-ai-powered-browser-automation-in-2025-712c9fd6cffa)
- **Fly.io Node.js** — [fly.io/docs/languages-and-frameworks/node/](https://fly.io/docs/languages-and-frameworks/node/)
- **Code sandboxing** — [northflank.com best code execution sandbox 2026](https://northflank.com/blog/best-code-execution-sandbox-for-ai-agents) — LOW confidence (WebSearch only; but rationale for native execution over E2B is architectural)

---

## Confidence Notes

| Area | Confidence | Basis |
|------|------------|-------|
| All package versions | HIGH | Verified via `npm view` directly against live npm registry |
| Mastra as agent framework | HIGH | v1 stable Nov 2025, 220k weekly downloads, multiple sources |
| Stagehand for browser | HIGH | v3 released, TypeScript-native, Browserbase Series B, multiple sources |
| Vercel AI SDK for multi-model | HIGH | 20M downloads, official docs, multiple sources |
| @solana/kit over web3.js v1 | HIGH | Official Solana docs, Helius guide, anza-xyz/kit GitHub |
| Drizzle over Prisma for agent schema | MEDIUM | Logical rationale well-supported; actual agent schema extension pattern is emerging, fewer direct sources |
| BullMQ over Temporal | MEDIUM | Sources agree Temporal is overkill for single-VM; BullMQ sufficient for described use case |
| Native code execution (no E2B) | MEDIUM | Architectural reasoning; Fly.io VM provides OS isolation; no conflicting sources found |
| Hono for dashboard | MEDIUM | Performance benchmarks verified; multiple comparisons agree on recommendation |

---

*Stack research for: Jarvis — autonomous TypeScript AI agent (Fly.io, Solana, multi-model LLM)*
*Researched: 2026-02-18*
