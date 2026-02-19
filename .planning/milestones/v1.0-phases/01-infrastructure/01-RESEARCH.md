# Phase 1: Infrastructure - Research

**Researched:** 2026-02-18
**Domain:** Node.js tool execution, Postgres + Redis persistence, structured audit logging, Turborepo monorepo
**Confidence:** HIGH (core stack verified via official docs and Context7; patterns cross-referenced across multiple sources)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Tool access model
- Unrestricted root/sudo access on the host VM — the agent can do anything
- No constraints on tool execution before the kill switch (Phase 2) — tools run freely, timeout is the only limit (TOOL-07)
- Start with the four required tool types (shell, HTTP, file, DB) but build as a registry so the agent can create and register new tools as needed (supports Phase 8 self-extension)

#### Memory boundaries
- Redis holds hot state only: current cycle state, active tool results, recent conversation turns. Losing Redis loses only the current session, not critical data
- Postgres is the source of truth for everything persistent
- Memory consolidation produces structured documents with context: what was learned, when, confidence level, source — a knowledge base, not key-value pairs
- The agent never forgets. All consolidated facts are permanent. Old facts can be marked stale but are never deleted

#### Schema management
- No guardrails on schema changes. The agent can freely CREATE TABLE, ALTER TABLE, DROP TABLE. It owns the database

#### Audit trail
- Log everything: full request/response bodies, complete shell output, full query results. Storage is cheap, missing data is not recoverable
- All logs stored in Postgres only — structured JSON, SQL-queryable, no separate file-based logging
- Log access through SQL only — no dedicated log query API. The agent uses the same DB tool for log queries
- Full LLM chain of thought captured per decision — complete reasoning, not just summaries. Feeds the dashboard's decision log (DASH-07) later

#### Runtime and deployment
- Monorepo with packages (Turborepo/pnpm workspaces) — separate packages for core, tools, db, logging with clean boundaries
- Docker Compose for deployment — Postgres and Redis containers alongside the agent. Self-contained and portable
- Not locked to any cloud provider. Docker anywhere (VPS, Hetzner, DigitalOcean, Fly.io, etc.)
- Main process + worker architecture — main process runs the planning loop, separate workers handle long-running tools (browser, scraping). Communication via Redis/queue

### Claude's Discretion
- HTTP tool convenience features (JSON parsing, cookie jar, redirect following, response size limits)
- Exact Postgres schema design for logs, facts, and agent state
- Monorepo package boundaries and naming
- Worker process communication protocol
- Docker Compose service configuration

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TOOL-01 | Agent can execute shell commands on the host VM | child_process spawn with AbortController; timeout option; stream stdout/stderr |
| TOOL-02 | Agent can make HTTP requests to external APIs and services | `got` v14 for HTTP tool; built-in cookie jar, redirect, retry, JSON parsing |
| TOOL-03 | Agent can read and write files on the host filesystem | `fs/promises` API; streams for large files; FileHandle for partial reads/writes |
| TOOL-04 | Agent can query and modify the Postgres database via Drizzle ORM | `drizzle-orm` + `pg` driver; `db.execute(sql.raw())` for runtime DDL |
| TOOL-05 | Every tool call is logged before execution with input parameters | Pre-execution insert to `tool_calls` table via DB package; log before invoke |
| TOOL-07 | Every tool call has a configurable timeout with graceful failure | `AbortController` + `setTimeout` pattern for all tools; SIGTERM on timeout |
| DATA-01 | Agent state persists in Postgres across restarts | `agent_state` table with JSONB payload; Drizzle schema; survives container restart |
| DATA-02 | Agent can CREATE TABLE and ALTER TABLE to extend its own schema | `db.execute(sql.raw('CREATE TABLE ...'))` — raw DDL bypass of Drizzle type system |
| DATA-03 | Working memory (current cycle state) lives in LLM context window | No implementation required — this is the Claude context window itself |
| DATA-04 | Session memory (recent cycle summaries, active strategies) persists in Redis | ioredis; JSON-serialized documents; TTL or explicit key management |
| DATA-05 | Long-term memory (distilled facts, strategy history, credentials) persists in Postgres | `memory_facts` table with JSONB body; confidence/source/timestamp fields |
| DATA-06 | Memory consolidation runs periodically to distill raw outputs into structured facts | Periodic job (BullMQ or simple setInterval) that writes to `memory_facts` |
| LOG-01 | Every agent decision is logged with timestamp and reasoning summary | `decision_log` table; full chain-of-thought in JSONB; append-only |
| LOG-02 | Every tool call is logged with inputs, outputs, duration, and success/failure | `tool_calls` table; pre-log on start, update on completion with result/duration |
| LOG-03 | Every planning cycle is logged with goals set, tasks completed, and outcomes | `planning_cycles` table; opened at cycle start, closed at end with outcomes |
| LOG-04 | Logs are structured JSON and queryable via SQL | All log tables use JSONB columns; no separate log files; query via DB tool |
| LOG-05 | Audit log is append-only and immutable | No UPDATE/DELETE on log tables — enforced via Postgres trigger or application convention |
</phase_requirements>

---

## Summary

Phase 1 builds the agent's foundational infrastructure: four tool types that let it act on the world, two storage layers (Postgres + Redis) that let it remember, and a structured audit trail in Postgres that records everything. The stack is well-established and the tooling ecosystem is mature: Turborepo + pnpm workspaces for the monorepo, Drizzle ORM over node-postgres for the database layer, ioredis for Redis session state, `got` v14 for HTTP, Node.js `child_process` with AbortController for shell execution, and `fs/promises` for file operations.

The most important architectural insight is the **two-layer logging pattern**: every tool call requires a pre-execution log write (TOOL-05 mandates logging *before* execution), and then a post-execution update with the result. This means the logging package must be imported by the tool execution layer, not the reverse. The append-only requirement (LOG-05) is enforced at the application level via convention — no UPDATE or DELETE on log tables — since Postgres row-level security or triggers add complexity that isn't warranted here.

A critical implementation detail: Drizzle ORM does **not** natively support runtime DDL. The agent's ability to CREATE TABLE and ALTER TABLE at runtime (DATA-02) requires bypassing Drizzle's type system via `db.execute(sql.raw('CREATE TABLE ...'))`. This is supported by Drizzle's API but means those dynamically-created tables are untyped from Drizzle's perspective, which is acceptable given this use case.

**Primary recommendation:** Build the `@jarvis/db` package first (schema + connection), then the `@jarvis/logging` package (which depends on db), then the four tool implementations (which depend on logging), and wire everything together in the `@jarvis/core` main process package.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| turborepo | latest | Monorepo build orchestration, task caching | Standard for pnpm monorepos; incremental builds, parallel execution |
| pnpm | 9.x | Package manager with workspace support | Faster than npm/yarn; disk-efficient; native workspace protocol |
| drizzle-orm | latest | Type-safe Postgres ORM + query builder | TypeScript-first, close to raw SQL, supports `db.execute` for DDL |
| drizzle-kit | latest | Schema migration CLI (`generate`, `push`, `migrate`) | Required companion to drizzle-orm |
| pg | 8.x | node-postgres driver (Drizzle uses this internally) | Battle-tested; connection pooling; used by drizzle-orm/node-postgres |
| ioredis | 5.x | Redis client for session/hot state | Full-featured, TypeScript-native, autopipelining, cluster support |
| got | 14.x | HTTP client for the HTTP tool | ESM-only; built-in retry, cookie jar, redirect, JSON parsing, streaming |
| bullmq | 5.x | Job queue over Redis for worker communication | Main process + worker architecture; BullMQ is the standard for Redis queues |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tough-cookie | 4.x | Cookie jar implementation for `got` | When HTTP tool needs persistent cookie sessions |
| zod | 3.x | Runtime validation for tool inputs/outputs | Validate tool parameters before execution; type-safe tool registry |
| dotenv | 16.x | Environment variable loading | Load DATABASE_URL, REDIS_URL, etc. from .env |
| tsx | latest | TypeScript execution for scripts and workers | Run TS directly without build step in development |
| @types/pg | latest | Type definitions for pg driver | Required dev dependency when using drizzle-orm/node-postgres |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `got` | `undici` (native) | undici is 3x faster for raw throughput but lacks built-in retry, cookie jar, redirect following; `got` is better for the HTTP tool use case |
| `got` | `axios` | axios is CJS-first and heavier; `got` is ESM-native and has better streaming |
| `ioredis` | `node-redis` (v4) | node-redis supports Redis 8 Stack features but ioredis has better autopipelining and TypeScript-native support |
| `bullmq` | raw Redis pub/sub | BullMQ gives persistence, retries, and dead letter queues; pub/sub is fire-and-forget |
| `drizzle-orm` | Prisma | Prisma abstracts away SQL more aggressively; drizzle lets you drop to raw SQL easily, which is essential for runtime DDL |

**Installation:**
```bash
# Root
pnpm add -D turbo

# @jarvis/db package
pnpm add drizzle-orm pg
pnpm add -D drizzle-kit tsx @types/pg

# @jarvis/logging package (depends on @jarvis/db)
# No additional deps — uses drizzle from @jarvis/db

# @jarvis/tools package
pnpm add got tough-cookie ioredis bullmq zod
```

---

## Architecture Patterns

### Recommended Project Structure
```
jarvis/                          # monorepo root
├── apps/
│   └── agent/                  # Main agent process (planning loop)
│       ├── src/
│       │   ├── index.ts         # Entry point: connects all packages
│       │   └── worker.ts        # BullMQ worker entry point
│       └── package.json
├── packages/
│   ├── db/                     # @jarvis/db — schema, connection, migrations
│   │   ├── src/
│   │   │   ├── schema/
│   │   │   │   ├── agent-state.ts
│   │   │   │   ├── memory-facts.ts
│   │   │   │   ├── tool-calls.ts
│   │   │   │   ├── decision-log.ts
│   │   │   │   ├── planning-cycles.ts
│   │   │   │   └── index.ts     # Re-exports all schemas
│   │   │   ├── client.ts        # Drizzle db instance + Pool
│   │   │   └── index.ts
│   │   ├── drizzle/             # Generated migration files
│   │   ├── drizzle.config.ts
│   │   └── package.json
│   ├── logging/                 # @jarvis/logging — audit trail writes
│   │   ├── src/
│   │   │   ├── tool-logger.ts   # Log tool calls (pre + post)
│   │   │   ├── decision-logger.ts
│   │   │   ├── cycle-logger.ts
│   │   │   └── index.ts
│   │   └── package.json
│   ├── tools/                   # @jarvis/tools — tool registry + implementations
│   │   ├── src/
│   │   │   ├── registry.ts      # ToolRegistry class
│   │   │   ├── shell/
│   │   │   │   └── index.ts
│   │   │   ├── http/
│   │   │   │   └── index.ts
│   │   │   ├── file/
│   │   │   │   └── index.ts
│   │   │   ├── db-tool/         # DB query tool (distinct from @jarvis/db package)
│   │   │   │   └── index.ts
│   │   │   └── index.ts
│   │   └── package.json
│   └── typescript-config/       # @jarvis/typescript-config — shared tsconfig
│       ├── base.json
│       └── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── docker-compose.yml
```

### Pattern 1: Tool Registry with Typed Interface

**What:** A registry that stores tool definitions by name, with typed input/output schemas. The agent invokes tools by name, the registry looks up the handler, validates input, executes with timeout, logs before/after.

**When to use:** Required from the start — the registry must be extensible (Phase 8 self-extension) so the agent can register new tools at runtime.

**Example:**
```typescript
// Source: adapted from plugin registry pattern; zod for runtime validation
import { z } from 'zod';

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  timeoutMs: number;
  execute(input: TInput): Promise<TOutput>;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  async invoke(name: string, rawInput: unknown): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Tool not found: ${name}`);

    // Validate input at runtime
    const input = tool.inputSchema.parse(rawInput);

    // Timeout via AbortController
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), tool.timeoutMs);

    try {
      return await tool.execute(input);
    } finally {
      clearTimeout(timer);
    }
  }

  list(): string[] {
    return [...this.tools.keys()];
  }
}
```

### Pattern 2: Tool Invocation with Pre/Post Logging

**What:** Every tool invocation logs a "started" record before execution (TOOL-05), then updates the record with result, duration, and success/failure on completion (LOG-02).

**When to use:** All tool invocations — this is mandatory per requirements.

**Example:**
```typescript
// The logging wrapper sits in @jarvis/logging; tool implementations don't log directly
export async function invokeWithLogging(
  registry: ToolRegistry,
  db: DbClient,
  name: string,
  input: unknown,
): Promise<unknown> {
  const startedAt = Date.now();

  // Pre-execution log (TOOL-05: log BEFORE execution)
  const logId = await db.insert(toolCallsTable).values({
    toolName: name,
    input: input,         // full input object as JSONB
    startedAt: new Date(),
    status: 'running',
  }).returning({ id: toolCallsTable.id });

  try {
    const output = await registry.invoke(name, input);
    const durationMs = Date.now() - startedAt;

    // Post-execution log (LOG-02: inputs, outputs, duration, success)
    await db.update(toolCallsTable)
      .set({ output, durationMs, status: 'success', completedAt: new Date() })
      .where(eq(toolCallsTable.id, logId[0].id));

    return output;
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    await db.update(toolCallsTable)
      .set({
        error: String(err),
        durationMs,
        status: 'failure',
        completedAt: new Date(),
      })
      .where(eq(toolCallsTable.id, logId[0].id));
    throw err;
  }
}
```

### Pattern 3: Shell Tool with Timeout

**What:** Execute shell commands using `child_process.spawn` wrapped in an AbortController-driven timeout. Capture full stdout/stderr (TOOL-01, TOOL-07).

**Example:**
```typescript
// Source: Node.js official docs — child_process with AbortController
import { spawn } from 'node:child_process';

export async function shellExecute(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const child = spawn(command, args, {
      signal: controller.signal,
      shell: false, // never pass untrusted input through shell: true
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? -1 });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
```

### Pattern 4: Dynamic DDL via Raw SQL

**What:** The agent can run CREATE TABLE, ALTER TABLE, DROP TABLE via `db.execute(sql.raw())`. Drizzle's type system is bypassed, but the execution is safe.

**Example:**
```typescript
// Source: Drizzle ORM docs — sql.raw() for unescaped DDL
import { sql } from 'drizzle-orm';
import { db } from '@jarvis/db';

// Agent creates a new table at runtime (DATA-02)
await db.execute(sql.raw(`
  CREATE TABLE IF NOT EXISTS agent_custom_data (
    id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    payload JSONB
  )
`));

// Agent alters a table at runtime
await db.execute(sql.raw(`
  ALTER TABLE agent_custom_data ADD COLUMN IF NOT EXISTS label TEXT
`));
```

### Pattern 5: Redis Session State

**What:** ioredis stores hot state as JSON-serialized documents. Keys are namespaced by cycle ID. Documents expire naturally when the session ends or are explicitly deleted.

**Example:**
```typescript
// Source: ioredis docs
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

// Store current cycle state
await redis.set(
  `cycle:${cycleId}:state`,
  JSON.stringify({ goals, activeTools, recentOutputs }),
  'EX',
  3600, // 1 hour TTL
);

// Retrieve
const raw = await redis.get(`cycle:${cycleId}:state`);
const state = raw ? JSON.parse(raw) : null;
```

### Pattern 6: Main Process + Worker via BullMQ

**What:** The main process (planning loop) adds jobs to a BullMQ queue. Worker processes pick up and execute long-running tool invocations (browser automation, scraping). Workers are separate Node.js processes communicating only via Redis.

**Example:**
```typescript
// Main process: add a job
import { Queue } from 'bullmq';
const toolQueue = new Queue('tool-execution', { connection: redis });

await toolQueue.add('browser-navigate', {
  url: 'https://example.com',
  action: 'scrape',
}, { removeOnComplete: true });

// Worker process (separate file, separate process)
import { Worker } from 'bullmq';
const worker = new Worker('tool-execution', async (job) => {
  // Execute long-running tool
  return await browserTool.execute(job.data);
}, { connection: redis, concurrency: 5 });
```

### Anti-Patterns to Avoid

- **Importing `@jarvis/logging` from `@jarvis/db`**: Circular dependency. Logging depends on db, never the reverse.
- **Using `spawn` with `shell: true` on agent-constructed commands**: Shell injection risk even in a trusted environment; always `shell: false` and pass args as array.
- **Buffering entire large file reads into memory**: Use `fs.createReadStream` + `pipeline()` for files over a few MB.
- **Storing logs in file system instead of Postgres**: Violates LOG-04 (SQL-queryable) and creates split-brain between log storage.
- **Using `drizzle-kit push` in production**: Push is for prototyping; use `drizzle-kit generate` + `drizzle-kit migrate` for reproducible deployments.
- **Forgetting `removeOnComplete: true` on BullMQ jobs**: Jobs accumulate in Redis memory indefinitely.
- **Not calling `pool.end()` on process shutdown**: Postgres connection pool leak; register `process.on('SIGTERM')` handlers.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Job queue with retries and persistence | Custom Redis pub/sub or DB polling | BullMQ | Dead letter queues, retry backoff, job deduplication, monitoring — all solved |
| HTTP with cookie sessions and retries | Custom fetch wrapper | `got` v14 | Cookie jar (tough-cookie), retry with backoff, redirect following, response size limiting — all built-in |
| Redis connection pool and reconnect | Raw `net.Socket` or `redis` module | ioredis | Autopipelining, cluster, Sentinel, reconnect strategies |
| Timeout-safe async operations | Manual Promise.race | AbortController + built-in `timeout` option | Standard pattern; AbortController propagates across child_process, fetch, and got |
| Schema migration tracking | Custom migration table | drizzle-kit | Tracks applied migrations, generates diffs, handles rollbacks |
| TypeScript config across packages | Copy-paste tsconfig.json | `@jarvis/typescript-config` package with `extends` | Single source of truth; Turborepo cache-friendly |

**Key insight:** Every hand-rolled solution in this domain has years of production bugs baked into the library version. The HTTP retry/cookie space alone has subtle edge cases (redirect loops, cookie domain matching, chunked encoding) that would take months to get right.

---

## Common Pitfalls

### Pitfall 1: LOG-05 Append-Only Enforcement

**What goes wrong:** Developers add UPDATE statements to log tables (e.g., to fill in the output field after execution), violating the append-only requirement.

**Why it happens:** The two-phase log pattern (pre-execution insert, post-execution update) seems to require UPDATE. But LOG-05 says append-only.

**Resolution strategy:** Accept the two-record pattern instead — one "started" row with no output, one "completed" row with full output. Query the completed row for reporting. Alternatively, use `status` updates via a separate linked table. The key is: the pre-execution record is never modified; a new record is inserted for completion.

**Or:** Interpret "immutable" as "never delete and never retroactively alter the substance" — an update to fill in `completed_at` and `output` on the same row is arguably not tampering. Document the interpretation explicitly.

**Warning signs:** Any `db.update()` call targeting a log table in application code. Add a lint rule or code review check.

### Pitfall 2: Drizzle DDL vs. Dynamic Runtime Schema

**What goes wrong:** The agent calls `db.insert(myNewTable).values(...)` on a table it just created with `db.execute(sql.raw('CREATE TABLE ...'))` — but Drizzle has no schema object for `myNewTable`, so the call fails.

**Why it happens:** Drizzle's type-safe insert/select API requires a schema object defined at build time. Runtime-created tables have no schema object.

**How to avoid:** For tables the agent creates dynamically, always use raw SQL for ALL operations on those tables — not just DDL. Use `db.execute(sql.raw('INSERT INTO ...'))` or `db.execute(sql\`INSERT INTO my_table VALUES (${val})\`)`. Never mix Drizzle typed API with runtime-defined tables.

**Warning signs:** TypeScript errors saying "table is not defined" at runtime, or `undefined` table objects being passed to Drizzle insert/select.

### Pitfall 3: Shell Output Size Explosion

**What goes wrong:** A shell command (e.g., `find / -name "*.log"` or `cat` on a large file) produces gigabytes of output. Buffering it in memory crashes the process.

**Why it happens:** The "log everything" philosophy means the logging layer tries to store the full stdout in Postgres. For multi-GB outputs, this is catastrophic.

**How to avoid:** Implement a response size limit in the shell tool (e.g., 10MB cap). Truncate stdout/stderr at the limit and add a `truncated: true` flag in the log record. Let the agent know it was truncated.

**Warning signs:** Process memory climbing unbounded during a shell tool invocation; large JSONB blobs in the `tool_calls` table.

### Pitfall 4: Docker Compose Startup Race

**What goes wrong:** The agent process starts before Postgres is fully ready to accept connections, causing immediate connection failure.

**Why it happens:** `depends_on: postgres` only waits for the container to start, not for Postgres to be ready to accept connections.

**How to avoid:** Use `depends_on` with `condition: service_healthy` and add a proper `healthcheck` to the Postgres service using `pg_isready`. Also add a `start_period` to the healthcheck to absorb initialization time.

**Warning signs:** Agent container exits with "ECONNREFUSED" or "Connection refused" on startup.

### Pitfall 5: ioredis Commands Hanging Silently

**What goes wrong:** A Redis command (`get`, `set`) never resolves, hanging the entire planning loop.

**Why it happens:** ioredis queues commands until connected. If the connection never fully establishes, commands wait forever with no error.

**How to avoid:** Set a `commandTimeout` on the ioredis client. Also handle the `'error'` event on the Redis client — unhandled error events in Node.js crash the process.

**Warning signs:** Promises that never resolve in Redis operations; process hanging without output.

### Pitfall 6: Turborepo Cache Invalidation from Root Files

**What goes wrong:** Changing a file in the monorepo root (e.g., `turbo.json`, root `package.json`) invalidates the cache for all packages, making every build a full rebuild.

**Why it happens:** Turborepo's cache key includes root-level files. Scripts or configs in the root propagate changes to all packages.

**How to avoid:** Move scripts to a dedicated package (e.g., `packages/scripts`). Avoid `tsconfig.json` in the root. Keep `turbo.json` changes minimal. The Turborepo docs explicitly warn against scripts at the workspace root for this reason.

**Warning signs:** All packages rebuilding from scratch after seemingly unrelated changes to root files.

---

## Code Examples

Verified patterns from official sources:

### Drizzle Schema for Audit Log Tables
```typescript
// Source: https://orm.drizzle.team/docs/column-types/pg + best practices guide
import {
  pgTable, integer, text, timestamp, jsonb, varchar, boolean
} from 'drizzle-orm/pg-core';

// Tool execution log (append-only, covers LOG-02)
export const toolCalls = pgTable('tool_calls', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  toolName: varchar('tool_name', { length: 128 }).notNull(),
  status: varchar('status', { length: 32 }).notNull().default('running'), // running | success | failure
  input: jsonb('input').notNull(),   // full input parameters
  output: jsonb('output'),           // full response body (null if still running)
  error: text('error'),              // error message if failed
  durationMs: integer('duration_ms'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

// Agent decision log (append-only, covers LOG-01)
export const decisionLog = pgTable('decision_log', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  cycleId: integer('cycle_id'),
  reasoning: jsonb('reasoning').notNull(),  // full chain-of-thought (LOG-01: complete reasoning)
  decision: text('decision').notNull(),      // summary
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Planning cycles (covers LOG-03)
export const planningCycles = pgTable('planning_cycles', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  goals: jsonb('goals').notNull(),
  status: varchar('status', { length: 32 }).notNull().default('active'),
  outcomes: jsonb('outcomes'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

// Long-term memory facts (covers DATA-05)
export const memoryFacts = pgTable('memory_facts', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  subject: text('subject').notNull(),
  body: jsonb('body').notNull(),     // { learned: string, confidence: number, source: string }
  isStale: boolean('is_stale').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Agent state (covers DATA-01)
export const agentState = pgTable('agent_state', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  key: varchar('key', { length: 256 }).notNull().unique(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

### Drizzle Database Client Setup
```typescript
// Source: https://orm.drizzle.team/docs/get-started/postgresql-new
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,
});

export const db = drizzle(pool, { schema });
export type DbClient = typeof db;
```

### Docker Compose Service Configuration
```yaml
# Source: Docker Compose docs + healthcheck best practices 2025
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: jarvis
      POSTGRES_PASSWORD: jarvis
      POSTGRES_DB: jarvis
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U jarvis -d jarvis"]
      interval: 5s
      timeout: 5s
      retries: 5
      start_period: 10s

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  agent:
    build: .
    command: node dist/index.js
    environment:
      DATABASE_URL: postgres://jarvis:jarvis@postgres:5432/jarvis
      REDIS_URL: redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

volumes:
  postgres_data:
```

### got HTTP Tool
```typescript
// Source: https://github.com/sindresorhus/got + npm package docs
import got, { type Options } from 'got';
import { CookieJar } from 'tough-cookie';

const cookieJar = new CookieJar();

const httpClient = got.extend({
  cookieJar,               // persistent cookie jar across requests
  followRedirect: true,
  maxRedirects: 10,
  timeout: { request: 30_000 },  // 30s default; overridden per tool call
  responseType: 'text',   // return raw text; tool layer parses JSON if needed
});

export async function httpRequest(params: {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const response = await httpClient(params.url, {
    method: params.method,
    headers: params.headers,
    body: params.body,
    timeout: { request: params.timeoutMs ?? 30_000 },
    throwHttpErrors: false,  // don't throw on 4xx/5xx — return them as results
  });

  return {
    status: response.statusCode,
    headers: response.headers as Record<string, string>,
    body: response.body,
  };
}
```

### Turborepo Config
```json
// turbo.json — Source: https://turborepo.dev/docs
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "persistent": true,
      "cache": false
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    }
  }
}
```

### pnpm Workspace Config
```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `serial` primary keys in Postgres | `generatedAlwaysAsIdentity()` | Postgres 10+, Drizzle adopted 2024-2025 | Identity columns are SQL-standard and safer than sequences |
| `CancelToken` in axios | `AbortController` | axios v0.22.0 (2021), standard by 2024 | Use AbortController for all cancellation; CancelToken is deprecated |
| `child_process.exec()` with callbacks | `util.promisify(exec)` or `spawn` with streams | Node.js v12+ | Promise-based; exec buffers output so use spawn for streaming |
| File-based logging (winston/pino to disk) | Structured JSONB in Postgres | 2023-2025 AI agent systems | SQL-queryable; no log shipping; integrated with the agent's DB tool |
| `require()` CJS for libraries | ESM-only packages (got v12+) | 2022-2025 | `got` v14 is ESM-only; agent packages should be ESM |
| TypeScript Project References in monorepos | Per-package tsconfig + shared `extends` | Turborepo guidance 2023+ | Simpler, better cache behavior, fewer config layers |

**Deprecated/outdated:**
- `node-fetch`: Superseded by native `fetch` (Node 18+) and `got` for agent use cases
- `axios` CancelToken: Deprecated since v0.22.0; use AbortController
- `bull` (the original): Superseded by `bullmq` which is written in TypeScript and has more features
- `serial` column type in Postgres: Use `generatedAlwaysAsIdentity()` instead
- `forever` / `nodemon` for process management: `tsx --watch` for dev, Docker restart policies for production

---

## Open Questions

1. **LOG-05 Interpretation: Strict vs. Pragmatic Append-Only**
   - What we know: LOG-05 says "append-only and immutable." The two-phase logging pattern (pre-log + post-update) seems to require UPDATE.
   - What's unclear: Does "immutable" mean no UPDATEs at all (requiring two separate rows per tool call), or does it mean "no retroactive tampering with historical records" (allowing UPDATEs to fill in completion data)?
   - Recommendation: **Two-row approach** is architecturally cleanest. Row 1: `status='started', input=...`. Row 2: `status='completed', tool_call_started_id=<ref>, output=..., duration=...`. Queries join them. This requires no UPDATEs on log tables at all. If two-row adds too much query complexity, document the one-row UPDATE interpretation explicitly in code comments.

2. **Memory Consolidation Trigger**
   - What we know: DATA-06 requires periodic consolidation. The architecture has BullMQ available.
   - What's unclear: Is consolidation triggered by time (every N minutes), by volume (every N raw log entries), or by the agent explicitly scheduling it?
   - Recommendation: For Phase 1, implement as a simple periodic task in the main process (`setInterval`). BullMQ is available if it needs to be offloaded to a worker later.

3. **`got` ESM Compatibility in Turborepo**
   - What we know: `got` v14 is ESM-only. Turborepo packages need careful ESM/CJS configuration.
   - What's unclear: Whether all packages in the monorepo need `"type": "module"` or if dynamic `import()` is needed in CJS packages.
   - Recommendation: Set `"type": "module"` in all `@jarvis/*` packages. Use `tsx` for running TypeScript directly in development. Compile to ESM for production. Verify this works with the `pg` driver (which is CJS) via the `drizzle-orm/node-postgres` adapter which handles the interop.

4. **Response Size Limits for "Log Everything"**
   - What we know: The philosophy is "storage is cheap, capture everything." Shell commands can produce gigabytes.
   - What's unclear: Where exactly the size cap should live (in the tool, in the logging layer, or configurable per tool).
   - Recommendation: Implement a configurable `maxOutputBytes` per tool definition (default 10MB for shell, unlimited for DB results). Truncate and flag `output_truncated: true` in the log record.

---

## Sources

### Primary (HIGH confidence)
- Drizzle ORM official docs (https://orm.drizzle.team/docs/get-started/postgresql-new) — schema setup, migrations, `db.execute`, JSONB columns
- Drizzle ORM sql.raw() docs (https://orm.drizzle.team/docs/sql) — runtime DDL pattern confirmed
- Turborepo official docs (https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository) — repository structure, package boundaries, exports, tsconfig guidance
- Node.js official docs (https://nodejs.org/api/child_process.html) — spawn, AbortController, timeout option
- got npm package (https://www.npmjs.com/package/got) — v14 features: ESM-only, cookie jar, redirect, retry, streaming
- BullMQ official docs (https://docs.bullmq.io/guide/parallelism-and-concurrency) — worker architecture, concurrency model
- Docker Compose official docs (https://docs.docker.com/reference/compose-file/services/) — healthcheck, depends_on, condition: service_healthy

### Secondary (MEDIUM confidence)
- WebSearch: Drizzle ORM dynamic schema GitHub issue #1807 — confirms raw SQL required for runtime DDL; workaround pattern documented
- WebSearch: Docker Compose Postgres + Redis healthcheck patterns (multiple 2025 sources) — confirmed `pg_isready` and `redis-cli ping` as standard health checks
- WebSearch: ioredis commandTimeout and error handling patterns — confirmed via npm README and multiple guides
- WebSearch: BullMQ + worker threads architecture (December 2025 Medium article) — confirmed main process + worker communication pattern

### Tertiary (LOW confidence)
- WebSearch: LOG-05 append-only interpretation — no single authoritative source on two-row vs. update pattern; recommendation is based on architectural reasoning

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified against official docs and npm registry; versions confirmed current
- Architecture (monorepo structure): HIGH — verified against Turborepo official docs
- Architecture (Drizzle schema): HIGH — verified against official Drizzle docs with code examples
- Architecture (tool registry pattern): MEDIUM — pattern is standard plugin architecture; specific implementation is inferred from requirements
- Pitfalls: HIGH for startup race and Drizzle DDL (verified issues); MEDIUM for LOG-05 interpretation (design decision, not a technical fact)
- Code examples: HIGH — all examples reference official sources or confirmed APIs

**Research date:** 2026-02-18
**Valid until:** 2026-03-18 (stable libraries; Drizzle and Turborepo release frequently but breaking changes are rare)
