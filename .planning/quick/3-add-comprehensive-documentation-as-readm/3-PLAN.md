---
phase: quick-3
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [README.md]
autonomous: true
requirements: [QUICK-3]

must_haves:
  truths:
    - "Developer can understand what Jarvis is and its core value proposition from the README"
    - "Developer can set up a local development environment using only the README instructions"
    - "Developer can understand the monorepo architecture and how packages relate to each other"
    - "Developer can find all required and optional environment variables"
  artifacts:
    - path: "README.md"
      provides: "Comprehensive project documentation"
      min_lines: 200
  key_links: []
---

<objective>
Create a comprehensive README.md for the Jarvis project that documents the autonomous money-making agent.

Purpose: The project has 12,700+ LOC across 133 TypeScript files in a 9-package monorepo with no README. A new developer (or the operator returning after time away) needs a single document to understand what this is, how to set it up, how it works, and what each package does.

Output: A polished README.md at the repository root.
</objective>

<execution_context>
@/Users/sn0w/.claude/get-shit-done/workflows/execute-plan.md
@/Users/sn0w/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create comprehensive README.md</name>
  <files>README.md</files>
  <action>
Create README.md at the repository root with the following sections and content. Use clean, technical markdown. No emojis. No badges. No fluff.

**Structure:**

1. **Title and one-line description**
   - "Jarvis" as h1
   - One-liner: "A fully autonomous money-making agent that runs 24/7. Given a Solana wallet, a database, and multi-model AI access, it bootstraps everything else."

2. **What This Is** (2-3 paragraphs)
   - Autonomous agent that reasons about opportunities, acquires tools/accounts, executes strategies without human intervention
   - 12,700+ LOC TypeScript across 133 files in a Turborepo monorepo with 9 packages
   - v1.0 MVP: goal-planner agent loop with sub-agent parallelism, Solana wallet with IPC signing and spend governance, Playwright browser automation with stealth and CAPTCHA solving, encrypted identity vault, strategy engine with portfolio management, self-extending tool system, real-time operator dashboard

3. **Architecture Overview**
   - Monorepo structure diagram showing the 3 apps and 6 packages:
     ```
     jarvis/
       apps/
         agent/       — Main agent process (goal loop, multi-agent supervisor, strategy engine, crash recovery)
         dashboard/   — Operator dashboard (Hono REST API + SSE streaming)
         cli/         — CLI tool (Commander.js)
       packages/
         db/          — Postgres via Drizzle ORM (22 schema tables)
         ai/          — Multi-model routing via OpenRouter (Claude/GPT/Grok tiers), cost monitoring
         wallet/      — Solana wallet (SOL+SPL), IPC signer co-process, spend governance
         browser/     — Playwright with stealth plugin, CAPTCHA solving (2captcha)
         tools/       — 20 agent tools (shell, HTTP, file, DB, browser, identity, wallet, self-extension)
         logging/     — Structured logging to Postgres
         typescript-config/ — Shared tsconfig
     ```
   - Package dependency flow: db is the base, logging/ai depend on db, wallet depends on ai+db, browser is standalone, tools depends on all packages, agent/dashboard/cli are the apps

4. **How It Works** (the agent loop)
   - Goal-planner loop: set goals -> decompose into sub-goals -> execute via tool calls -> evaluate outcomes -> replan
   - Multi-agent: main agent spawns sub-agents via BullMQ for parallel task execution
   - Strategy engine: domain-agnostic lifecycle state machine (discovery -> evaluation -> execution -> monitoring)
   - Self-extension: agent writes its own TypeScript tools, compiles with esbuild, extends DB schema
   - Kill switch: agent starts OFF (kill switch active), operator enables via dashboard; persists across restarts
   - Crash recovery: journal checkpointing with replay on restart

5. **Prerequisites**
   - Node.js >= 22
   - pnpm 9.15.4 (corepack)
   - Docker (for Postgres 16 and Redis 7)
   - Solana wallet with SOL (for on-chain operations)
   - OpenRouter API key (for AI model access)

6. **Quick Start** (numbered steps)
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

7. **Environment Variables** — table format
   | Variable | Required | Description | Example |
   |----------|----------|-------------|---------|
   | DATABASE_URL | Yes | Postgres connection string | postgres://jarvis:jarvis@localhost:5433/jarvis |
   | REDIS_URL | Yes | Redis connection string | redis://localhost:6379 |
   | OPENROUTER_API_KEY | Yes | OpenRouter API key for AI model access | sk-or-... |
   | SOLANA_PRIVATE_KEY | Yes | Solana wallet private key (base58) | — |
   | SIGNER_SHARED_SECRET | Yes | HMAC secret for IPC signer authentication | (generate with openssl rand -hex 32) |
   | CREDENTIAL_ENCRYPTION_KEY | Yes | AES key for identity credential vault | (generate with openssl rand -hex 32) |
   | JARVIS_MODEL_STRONG | No | Strong tier model (default: anthropic/claude-opus-4.6) | anthropic/claude-opus-4.6 |
   | JARVIS_MODEL_MID | No | Mid tier model (default: anthropic/claude-sonnet-4.5) | anthropic/claude-sonnet-4.5 |
   | JARVIS_MODEL_CHEAP | No | Cheap tier model (default: x-ai/grok-4.1-fast) | x-ai/grok-4.1-fast |
   | DISCORD_BOT_TOKEN | No | Discord bot token for operator notifications | — |
   | DISCORD_OPERATOR_USER_ID | No | Discord user ID to receive DM alerts | — |
   | TWO_CAPTCHA_API_KEY | No | 2captcha API key for CAPTCHA solving | — |
   | DASHBOARD_PORT | No | Dashboard server port (default: 3001) | 3001 |
   | DASHBOARD_TOKEN | No | Bearer token for dashboard API auth | — |
   | SIGNER_SOCKET_PATH | No | Unix socket path for IPC signer (default: /tmp/jarvis-signer.sock) | /tmp/jarvis-signer.sock |

8. **Development** section
   - `pnpm dev` — start all packages in watch mode
   - `pnpm build` — build all packages
   - `pnpm typecheck` — typecheck all packages
   - `pnpm lint` — lint all packages
   - `pnpm db:push` — push schema changes to database
   - `pnpm db:generate` — generate Drizzle migrations
   - `pnpm docker:up` / `pnpm docker:down` — manage local infrastructure

9. **Agent Tools** — list all 20 tools grouped by category
   - Primitives (4): shell, http, file, db
   - Multi-agent (3): spawn_agent, await_agent, cancel_agent
   - Bootstrap (2): package_install, tool_discover
   - Self-extension (3): tool_write, tool_delete, schema_extend
   - Browser (8): browser_session_open, browser_session_close, browser_session_save, browser_navigate, browser_click, browser_fill, browser_extract, browser_screenshot

10. **Security Model** — brief section
    - IPC signing: private key never in LLM context; HMAC-SHA256 authenticated Unix socket co-process
    - Spend governance: configurable limits on wallet transactions
    - Credential vault: AES-encrypted storage for acquired service credentials
    - Kill switch: operator can halt agent via DB flag or dashboard; persists across restarts
    - No human approval gates by design — kill switch + observability is the safety model

11. **Tech Stack** — compact table
    | Component | Technology |
    |-----------|-----------|
    | Language | TypeScript |
    | Monorepo | Turborepo + pnpm workspaces |
    | Database | Postgres 16 + Drizzle ORM |
    | Queue | Redis 7 + BullMQ |
    | AI | OpenRouter (Claude, GPT, Grok) |
    | HTTP | Hono |
    | Browser | Playwright + stealth plugin |
    | Blockchain | @solana/web3.js |
    | Deployment | Docker / Fly.io |

12. **Project Status**
    - v1.0 MVP shipped
    - All 93 v1 requirements satisfied
    - Active development: on-chain DeFi integration, dashboard frontend SPA

Do NOT include:
- Badges or shields
- Contributing guidelines
- License section (no LICENSE file exists)
- Table of contents (document is scannable without one)
- Emojis
  </action>
  <verify>
Confirm README.md exists at repository root, is well-formed markdown, contains all 12 sections listed above, and has 200+ lines.

Run: `wc -l README.md` to check line count.
Run: `head -5 README.md` to verify it starts with the title.
Verify each h2 section exists by grepping for section headers.
  </verify>
  <done>README.md exists at repository root with all sections: What This Is, Architecture Overview, How It Works, Prerequisites, Quick Start, Environment Variables (complete table with all env vars found in codebase), Development commands, Agent Tools (20 tools), Security Model, Tech Stack, Project Status. Minimum 200 lines. Accurate to the actual codebase.</done>
</task>

</tasks>

<verification>
- README.md exists at /Users/sn0w/Documents/dev/jarvis/README.md
- All env vars from codebase (DATABASE_URL, REDIS_URL, OPENROUTER_API_KEY, SOLANA_PRIVATE_KEY, SIGNER_SHARED_SECRET, CREDENTIAL_ENCRYPTION_KEY, model overrides, Discord vars, TWO_CAPTCHA_API_KEY, DASHBOARD_PORT, DASHBOARD_TOKEN, SIGNER_SOCKET_PATH) are documented
- All 20 agent tools are listed
- All 9 packages are described
- Quick start steps are accurate (pnpm, docker compose, db:push, build, start)
</verification>

<success_criteria>
A developer with no prior context can read the README and: (1) understand what Jarvis is and why it exists, (2) set up a local development environment, (3) understand how the packages relate to each other, (4) find every environment variable they need to configure.
</success_criteria>

<output>
After completion, create `.planning/quick/3-add-comprehensive-documentation-as-readm/3-SUMMARY.md`
</output>
