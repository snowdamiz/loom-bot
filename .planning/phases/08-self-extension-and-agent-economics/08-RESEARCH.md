# Phase 8: Self-Extension and Agent Economics - Research

**Researched:** 2026-02-18
**Domain:** Agent self-extension (sandboxed code execution, tool hot-registration, schema migration, git staging) + x402 micropayments
**Confidence:** MEDIUM-HIGH (core Node.js APIs HIGH; drizzle-kit/api undocumented MEDIUM; x402 ecosystem HIGH)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Sandbox boundaries
- Isolation model is Claude's discretion (child process, VM, or in-process — research will determine best fit)
- Generated tools have full network access — no allowlisting or restrictions
- Generated tools can import any installed npm package (including packages installed at runtime via Phase 6 bootstrap)
- On crash/throw: catch and report error back to agent as tool result — agent decides whether to fix or abandon

#### Tool lifecycle
- Auto-register immediately after passing sandbox tests — no operator approval gate
- Full mutation allowed — agent can update, replace, or delete any tool it previously created
- Tool source code persists to disk in a known directory, loaded on startup — survives restarts
- Agent can modify ALL tools including built-in ones (Phases 1-7), but built-in tool modifications must be tested in a staging sandbox using git branches first before applying to production code
- Generated-only tools (agent-authored) can be modified freely without staging

#### Schema evolution rules
- Additive + soft destructive DDL: CREATE TABLE, ADD COLUMN, CREATE INDEX, ALTER COLUMN (type changes, defaults) — no DROP TABLE or DROP COLUMN
- Agent owns `agent_*` namespace freely (full control over agent-prefixed tables)
- Agent can ADD COLUMN to core tables but cannot do destructive changes to core schema
- Migration tracking mechanism is Claude's discretion (Drizzle vs separate agent_migrations table — research will determine)
- Failed schema changes auto-rollback inside a transaction — no partial state

### Claude's Discretion
- Sandbox isolation model (child process vs VM vs in-process)
- Migration tracking mechanism (Drizzle integration vs separate table)
- Rollback strategy for failed tool deployments
- Git branch workflow for built-in tool staging

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EXTEND-01 | Agent can write TypeScript code to create new tools and capabilities | esbuild transform API compiles TS strings to JS in-memory; child_process.fork runs compiled JS in isolated process |
| EXTEND-02 | Agent tests generated code in a sandbox before deploying to production | child_process.fork provides process-level isolation; sandbox harness communicates via IPC; crash in child does not affect parent |
| EXTEND-03 | Agent-created tools register in the tool registry and become available for use | Existing ToolRegistry has register/unregister; tool loader reads from known disk directory on startup |
| EXTEND-04 | Agent can extend its own database schema as its needs evolve | PostgreSQL DDL is fully transactional; raw SQL with pg client inside BEGIN/ROLLBACK block; separate agent_migrations table tracks history |
| EXTEND-05 | Failed code deployments are rolled back without affecting the core agent loop | child_process.fork failures are isolated to the child; tool deployment uses write-then-verify pattern; schema changes auto-rollback on error |
| AGENT-01 | Agent can discover services available via x402 protocol | Agent self-extends to build an x402 discovery tool using @x402/fetch — not pre-built |
| AGENT-02 | Agent can make micropayments to other agents/services for data or compute | @x402/fetch wraps native fetch; @x402/evm handles EVM signing; agent builds this tool itself |
| AGENT-03 | Agent can offer its own capabilities as paid services via x402 | @x402/express middleware; agent builds an Express server tool to expose capabilities |
| AGENT-04 | All x402 transactions are logged and tracked in P&L | Agent self-extends schema with agent_x402_transactions table; fits existing wallet_transactions pattern |
| STRAT-07 (moved) | Per-strategy P&L tracking | Agent creates agent_strategy_pnl table using EXTEND-04 DDL path; uses existing strategies table FK |
</phase_requirements>

---

## Summary

Phase 8 enables the agent to build its own capabilities rather than having them pre-built. The core loop is: agent writes TypeScript source → esbuild compiles to JS in-memory → child process fork tests the compiled code in isolation → on pass, tool is written to disk and hot-registered in the ToolRegistry → survives restarts by loading from disk on startup. The critical design insight is that **child_process.fork provides genuine process-level isolation**: a crash in the test harness cannot bring down the main agent loop.

Schema self-extension uses raw SQL wrapped in PostgreSQL transactions. PostgreSQL is unique among major databases in that DDL (CREATE TABLE, ALTER TABLE) is fully transactional — a failed migration inside BEGIN/ROLLBACK is atomically undone. The agent maintains its own `agent_migrations` table (separate from drizzle-kit) to track applied DDL without touching drizzle-kit's internals. This avoids the undocumented `drizzle-kit/api` programmatic push path, which exists but has no official docs and ESM/CJS interop issues.

For agent economics (AGENT-01 through AGENT-04), the agent builds x402 capabilities itself using self-extension. The x402 protocol (v2, launched May 2025) is mature: 100M+ payments processed, Visa and Cloudflare adopters, @x402/fetch and @x402/evm npm packages with clean TypeScript APIs. The agent writes an x402 payment tool, registers it, then uses it — AGENT-* requirements are satisfied through the EXTEND-* mechanism, not pre-built infrastructure.

**Primary recommendation:** Use `child_process.fork` for sandbox isolation, raw SQL transactions for schema evolution tracked via `agent_migrations` table, and `esbuild.transform()` for in-memory TypeScript compilation. Do not use Node.js `vm` module — it is explicitly documented as "not a security mechanism." The agent builds x402 tools itself; do not pre-build them.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `esbuild` | ^0.24.x | Compile TypeScript strings to JS in-memory | Sub-millisecond transform, built-in TS loader, no config needed, `transform()` API takes a string directly |
| `node:child_process` | built-in | Fork isolated process for sandbox testing | Process-level isolation — child crash cannot corrupt parent; built-in IPC channel; no new deps |
| `drizzle-orm` | ^0.40.0 (existing) | Query builder for agent_migrations tracking table | Already in the project; `db.execute(sql\`...\`)` for raw DDL |
| `pg` | ^8.13.3 (existing) | Raw SQL for DDL transactions | `pg.Pool.connect()` gives a raw connection for `BEGIN`/`ROLLBACK` DDL blocks |
| `simple-git` | ^3.27.x | Git branch operations for built-in tool staging | Promise-based Node.js git API; `checkoutLocalBranch()`, `merge()`, `deleteLocalBranch()` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@x402/fetch` | ^0.5.x | x402-aware HTTP client for agent micropayments | When agent self-extends to build payment capability |
| `@x402/evm` | ^0.5.x | EVM signing for x402 payments | Paired with @x402/fetch for EVM network payments |
| `@x402/express` | ^0.5.x | Serve agent capabilities as paid x402 endpoints | When agent self-extends to offer services |
| `@coinbase/x402` | ^0.5.x | Coinbase-hosted facilitator for payment verification | Server-side payment verification without own blockchain node |
| `viem` | ^2.x | EVM wallet/account primitives used by x402 | `privateKeyToAccount()` creates signers for @x402/evm |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `child_process.fork` | Node.js `vm` module | `vm` is documented as "not a security mechanism" — never use for untrusted code |
| `child_process.fork` | `isolated-vm` | isolated-vm gives V8-level isolation but adds a native dependency; fork is simpler and sufficient since the agent trusts its own generated code |
| `child_process.fork` | Docker container per test | Docker is too slow (seconds) for iterative tool testing; fork is milliseconds |
| `agent_migrations` table | `drizzle-kit/api` pushSchema | drizzle-kit/api is undocumented, has ESM/CJS interop bugs, requires createRequire workaround; raw SQL is more reliable |
| `simple-git` | `child_process.spawn('git', ...)` | simple-git provides typed API and error handling; spawn works too but requires manual arg escaping |
| `esbuild.transform()` | `tsx` in child process | tsx works but requires writing a file first; esbuild transform takes a string directly — no temp files needed for compilation |

**Installation (new deps only — the agent writes x402 tools itself, but these need to be installed for when the agent generates code using them):**
```bash
pnpm add esbuild simple-git --filter @jarvis/tools
# x402 packages are installed by the agent at runtime via BOOT-01 (package_install tool)
# No pre-installation needed; agent uses package_install when its strategy requires x402
```

Note: `esbuild` is likely already a transitive dep via tsx/turbo. Verify before adding.

---

## Architecture Patterns

### Recommended Project Structure
```
packages/@jarvis/tools/src/
├── self-extension/          # New: Phase 8 self-extension tools
│   ├── index.ts             # Exports createSelfExtensionTools(registry, db)
│   ├── tool-writer.ts       # tool_write: write TS source + compile + sandbox test + register
│   ├── sandbox-runner.ts    # Internal: forks child process, runs sandboxed test
│   ├── tool-loader.ts       # Startup: loads persisted tools from disk
│   ├── schema-extend.ts     # schema_extend: applies DDL in transaction, tracks in agent_migrations
│   └── staging-deployer.ts  # Internal: git branch workflow for built-in tool staging
├── registry.ts              # Existing — already has register/unregister
├── types.ts                 # Existing
└── ...

apps/agent/
├── src/
│   ├── agent-tools-dir/     # Persisted agent-authored tool source files
│   │   └── *.ts             # Each file = one agent-authored tool
│   └── ...

packages/@jarvis/db/src/schema/
├── agent-migrations.ts      # New: tracks DDL applied by agent self-extension
└── ...
```

### Pattern 1: TypeScript Compilation + Sandbox Test + Hot Registration

**What:** The agent provides TypeScript source code. The system compiles it with esbuild (in-memory, no temp files for compilation), writes the compiled JS + original TS to disk, forks a child process to run a test harness, and on pass, dynamically imports and registers the tool.

**When to use:** Every time the agent creates or modifies an agent-authored tool.

**Example:**
```typescript
// Source: esbuild.github.io/api/#transform (HIGH confidence)
import * as esbuild from 'esbuild';

async function compileTypeScript(tsSource: string): Promise<string> {
  const result = await esbuild.transform(tsSource, {
    loader: 'ts',
    format: 'esm',
    target: 'node20',
    platform: 'node',
  });
  if (result.errors.length > 0) {
    throw new Error(`Compilation failed: ${result.errors.map(e => e.text).join('\n')}`);
  }
  return result.code; // Plain JavaScript string
}
```

```typescript
// Source: nodejs.org/api/child_process.html (HIGH confidence)
import { fork } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import * as path from 'node:path';

interface SandboxResult {
  passed: boolean;
  output?: unknown;
  error?: string;
}

async function runInSandbox(
  compiledJs: string,
  toolName: string,
  testInput: unknown,
  timeoutMs = 30_000
): Promise<SandboxResult> {
  // Write compiled JS to a temp file (fork requires a file path, not a string)
  const tempPath = path.join('/tmp', `sandbox-${toolName}-${Date.now()}.mjs`);
  writeFileSync(tempPath, compiledJs, 'utf-8');

  return new Promise((resolve) => {
    const child = fork(tempPath, [], {
      silent: true,           // Capture stdout/stderr
      timeout: timeoutMs,
      execArgv: [],           // No extra Node flags
    });

    const messages: unknown[] = [];
    let timedOut = false;

    child.on('message', (msg) => messages.push(msg));

    child.on('exit', (code, signal) => {
      // Clean up temp file
      try { require('fs').unlinkSync(tempPath); } catch {}

      if (timedOut || signal === 'SIGKILL') {
        resolve({ passed: false, error: `Sandbox timeout after ${timeoutMs}ms` });
      } else if (code === 0) {
        resolve({ passed: true, output: messages[0] });
      } else {
        resolve({ passed: false, error: `Sandbox exited with code ${code}` });
      }
    });

    child.on('error', (err) => {
      resolve({ passed: false, error: err.message });
    });

    setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
  });
}
```

### Pattern 2: Tool Persistence and Startup Loading

**What:** Agent-authored tools are written as TypeScript files in a known directory. On agent startup, the loader scans this directory and dynamically imports each tool into the registry. This makes tools survive restarts without any database lookup.

**When to use:** During startup before the agent loop begins. Also used immediately after a new tool passes sandbox tests.

```typescript
// Source: existing codebase patterns (HIGH confidence — matches how bootstrap tools work)
import { readdirSync } from 'node:fs';
import * as path from 'node:path';
import type { ToolRegistry } from '../registry.js';
import type { ToolDefinition } from '../types.js';

const AGENT_TOOLS_DIR = path.join(process.cwd(), 'agent-tools');

export async function loadPersistedTools(registry: ToolRegistry): Promise<void> {
  let files: string[];
  try {
    files = readdirSync(AGENT_TOOLS_DIR).filter(f => f.endsWith('.js'));
  } catch {
    // Directory doesn't exist yet — first run, no persisted tools
    return;
  }

  for (const file of files) {
    try {
      const mod = await import(path.join(AGENT_TOOLS_DIR, file));
      const tool: ToolDefinition = mod.default ?? mod.tool;
      if (!tool || !tool.name) continue;

      // Unregister first in case of reload (agent restart after modification)
      registry.unregister(tool.name);
      registry.register(tool);
    } catch (err) {
      // Log but don't crash — bad tools are skipped, agent continues
      process.stderr.write(`[tool-loader] Failed to load ${file}: ${err}\n`);
    }
  }
}
```

### Pattern 3: Schema Extension via Raw SQL Transaction

**What:** The agent writes SQL DDL (CREATE TABLE, ADD COLUMN, CREATE INDEX). The system wraps it in a PostgreSQL transaction, executes it, and on success inserts a record into `agent_migrations`. On error, the transaction auto-rolls back — no partial state.

**When to use:** When agent self-extends schema for new capabilities (P&L tracking, x402 transactions, etc.).

```typescript
// Source: postgresql.org/docs/current/tutorial-transactions.html (HIGH confidence)
// PostgreSQL DDL is fully transactional — CREATE TABLE inside BEGIN rolls back on error
import { pool } from '@jarvis/db';

async function applyAgentMigration(
  name: string,
  ddlSql: string
): Promise<{ applied: boolean; error?: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if already applied (idempotency)
    const existing = await client.query(
      'SELECT id FROM agent_migrations WHERE migration_name = $1',
      [name]
    );
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return { applied: false, error: 'Already applied' };
    }

    // Execute the DDL (fully transactional in PostgreSQL)
    await client.query(ddlSql);

    // Record in agent_migrations inside the same transaction
    await client.query(
      'INSERT INTO agent_migrations (migration_name, sql_executed) VALUES ($1, $2)',
      [name, ddlSql]
    );

    await client.query('COMMIT');
    return { applied: true };
  } catch (err) {
    await client.query('ROLLBACK'); // DDL is rolled back — no partial state
    const message = err instanceof Error ? err.message : String(err);
    return { applied: false, error: message };
  } finally {
    client.release();
  }
}
```

### Pattern 4: Git Branch Workflow for Built-In Tool Staging

**What:** When the agent modifies a built-in Phase 1-7 tool, it creates a git branch, applies the change, runs tests in a forked sandbox, and merges only on success. The branch acts as a staging environment.

**When to use:** Only for built-in tool modifications. Agent-authored tools skip this step.

```typescript
// Source: npmjs.com/package/simple-git (HIGH confidence)
import simpleGit from 'simple-git';
import * as path from 'node:path';

const git = simpleGit(process.cwd());

async function stageAndTestBuiltinChange(
  toolName: string,
  filePath: string,
  newContent: string,
  testFn: () => Promise<boolean>
): Promise<{ success: boolean; error?: string }> {
  const branchName = `agent/builtin-mod/${toolName}-${Date.now()}`;

  try {
    // Create staging branch
    await git.checkoutLocalBranch(branchName);

    // Write the change
    const { writeFileSync } = await import('node:fs');
    writeFileSync(filePath, newContent, 'utf-8');

    await git.add(filePath);
    await git.commit(`agent: modify builtin tool ${toolName}`);

    // Run tests in sandbox
    const testPassed = await testFn();

    if (!testPassed) {
      // Abandon staging branch
      await git.checkout('main');
      await git.deleteLocalBranch(branchName, true);
      return { success: false, error: 'Tests failed in staging sandbox' };
    }

    // Merge to main (fast-forward)
    await git.checkout('main');
    await git.merge([branchName, '--ff-only']);
    await git.deleteLocalBranch(branchName);

    return { success: true };
  } catch (err) {
    // Ensure we're back on main even on error
    try { await git.checkout('main'); } catch {}
    try { await git.deleteLocalBranch(branchName, true); } catch {}
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
```

### Anti-Patterns to Avoid

- **Using `node:vm` for sandboxing:** The Node.js documentation explicitly states "The node:vm module is not a security mechanism. Do not use it to run untrusted code." It has no isolation — sandbox escapes are well-documented. Use `child_process.fork` instead.
- **Writing compiled JS to disk before deciding to register:** Write the source `.ts` AND compiled `.js` to disk only AFTER sandbox tests pass. Never persist a tool that failed tests.
- **Directly mutating drizzle-kit's migration files:** The agent's schema evolution must not touch drizzle-kit's `drizzle/` directory or `drizzle.config.ts`. Those belong to the static schema. Agent migrations live in `agent_migrations` table only.
- **Using `drizzle-kit/api` pushSchema programmatically:** The `drizzle-kit/api` sub-package is undocumented, has ESM/CJS interop bugs requiring `createRequire` workarounds, and may change without notice. Use raw SQL with `pool.connect()` instead.
- **Blocking the agent loop during sandbox tests:** Fork the child process asynchronously. The agent loop must remain responsive. Use the existing timeout/signal pattern from `withTimeout()` in `invoke.ts`.
- **Hot-importing from the same module path after modification:** Node.js module cache prevents re-importing the same path. For updates, write to a new filename (append version suffix) or use `import()` with cache-busting query param trick: `import(\`${path}?v=${Date.now()}\`)`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TypeScript compilation | Custom tsc wrapper, temp-file-based compilation pipeline | `esbuild.transform(src, { loader: 'ts' })` | Sub-millisecond, no temp files, single call API, built-in TS support |
| Process isolation sandbox | vm2, isolated-vm, custom IPC protocol | `child_process.fork()` with built-in IPC | Built-in to Node.js, genuine process boundary, IPC channel included, no new deps |
| Git operations | Manual `spawn('git', [...])` with string escaping | `simple-git` npm package | Typed API, promise-based, handles edge cases like detached HEAD |
| Schema migration tracking | Hand-rolled JSON files, separate migration system | Simple `agent_migrations` table with `pg` raw connection | PostgreSQL transactions make this safe; table is simple and auditable |
| DDL transaction safety | Application-level rollback logic | PostgreSQL's native transactional DDL | PostgreSQL rolls back DDL automatically on `ROLLBACK` — unlike MySQL/Oracle which auto-commit DDL |
| x402 payment signing | Custom EIP-712 signing, custom 402 header parsing | `@x402/fetch` + `@x402/evm` | Protocol complexity is real; these packages handle PAYMENT-REQUIRED header parsing, payment payload construction, retry logic |

**Key insight:** The agent loop already handles tool errors gracefully via `invokeWithKillCheck` → `invokeWithLogging` → `ToolResult<{ success: false }>`. Sandbox test failures should flow through the same ToolResult pattern — return `{ success: false, error: "..." }` to the agent so it can decide to fix or abandon.

---

## Common Pitfalls

### Pitfall 1: Node.js Module Cache Prevents Tool Updates

**What goes wrong:** Agent modifies a tool, writes the new JS to the same filename, calls `import('./agent-tools/my-tool.js')` — but Node.js returns the cached old module, not the new one.

**Why it happens:** Node.js ESM dynamic import caches by resolved URL. Same path → same cache entry.

**How to avoid:** Use a versioned filename strategy. When updating a tool, write to `my-tool-v2.js`, import from the new path. Or use a URL cache-buster: `import(\`file://${absPath}?bust=${Date.now()}\`)`. The version number strategy is simpler and produces an auditable history.

**Warning signs:** Tool appears updated on disk but registry still has old behavior after re-registration.

### Pitfall 2: drizzle.config.ts CJS Bundler with Cross-File Schema References

**What goes wrong:** Agent adds new schema files and tries to include them in `drizzle.config.ts`. drizzle-kit's CJS bundler cannot resolve `.js` extension back to `.ts` when there are foreign key cross-references across files.

**Why it happens:** This is a known drizzle-kit limitation, already documented in the codebase (see `strategies.ts` which co-locates with `goals.ts` for this reason).

**How to avoid:** The agent's schema changes do NOT go in drizzle.config.ts at all. Agent DDL is applied via raw SQL and tracked in `agent_migrations`. This bypasses drizzle-kit entirely for agent-owned tables. The existing static schema is unchanged.

**Warning signs:** `pnpm db:push` fails after agent schema changes — this means the agent wrongly modified drizzle.config.ts.

### Pitfall 3: Compiled Tool Cannot Import Workspace Packages

**What goes wrong:** Agent writes a tool that does `import { db } from '@jarvis/db'`. The compiled JS is written to `agent-tools/` and dynamically imported. The import fails because `@jarvis/db` resolves relative to the file location, not the workspace root.

**Why it happens:** Node.js ESM resolution for workspace packages depends on the package.json `exports` field and the `node_modules` symlinks. When importing from an unexpected path, this usually works — but only if the file is inside the project root where `node_modules` is visible.

**How to avoid:** Always write agent tool files inside the project root (`apps/agent/agent-tools/` not `/tmp/agent-tools/`). The project root's `node_modules` is visible to all files underneath it. Do not write tools to absolute `/tmp` paths for production persistence.

**Warning signs:** Dynamic import throws `ERR_MODULE_NOT_FOUND` for workspace packages.

### Pitfall 4: child_process.fork Requires a File, Not a String

**What goes wrong:** Developer tries `fork(compiledJsString, ...)` — fork requires a file path, not code as a string.

**Why it happens:** `fork()` is designed to run a Node.js module file, not inline code. `vm.runInNewContext()` takes a string but has no isolation.

**How to avoid:** Always write compiled JS to a temp file before forking. Use `/tmp/sandbox-{toolName}-{timestamp}.mjs` naming to avoid collisions. Clean up the temp file in the `exit` handler (wrap in try/catch — the file may already be gone).

**Warning signs:** `TypeError: The "path" argument must be of type string` when calling fork.

### Pitfall 5: PostgreSQL Connection Held During Long DDL

**What goes wrong:** Agent acquires a `pool.connect()` client, starts a DDL transaction, then calls the LLM to decide what to do next while still holding the connection. The DDL transaction holds a schema lock.

**Why it happens:** PostgreSQL DDL acquires AccessExclusiveLock on the affected table. Holding this lock during LLM inference (seconds to minutes) blocks all other operations on that table.

**How to avoid:** Compile the full DDL SQL string BEFORE acquiring the database connection. Get connection, BEGIN, execute DDL, COMMIT/ROLLBACK, release connection — all in one synchronous sequence with no async awaits to the LLM in between.

**Warning signs:** Queries against agent-owned tables hang; `pg_locks` shows AccessExclusiveLock held by an idle transaction.

### Pitfall 6: git merge Fails Because Working Tree is Dirty

**What goes wrong:** Agent creates a staging branch, writes tool file, commits, tests pass, tries to `git merge` back to main — but main's working tree has other uncommitted changes from the running agent.

**Why it happens:** The agent process is running with the monorepo as its working directory. The agent may have other files in-progress.

**How to avoid:** For built-in tool staging, operate only on the specific tool file. Before switching branches, verify the working tree is clean for that file path specifically. Use `--ff-only` merge to ensure no merge commit is created — if the branch diverged, fail fast rather than creating a merge commit.

**Warning signs:** `simple-git` throws `GitError: Your local changes would be overwritten by merge`.

### Pitfall 7: Tool Registration Race in Worker Process

**What goes wrong:** The agent loop runs in `apps/agent/src/index.ts` but tool execution queues through BullMQ worker in `apps/agent/src/worker.ts`. The worker has its own `ToolRegistry` instance (`createDefaultRegistry(db)` at line 38 of worker.ts). A newly registered tool in the agent loop's registry is NOT visible to the worker's registry.

**Why it happens:** Two separate Node.js processes, two separate in-memory ToolRegistry instances.

**How to avoid:** Agent-authored tools must be persisted to disk in `agent-tools/` and loaded by BOTH the agent loop process AND the BullMQ worker process at startup. The `loadPersistedTools()` function must be called in both entry points. On new tool creation, the worker process does NOT need to restart — but it needs to reload from disk. One approach: after registering a new tool, send a BullMQ job of type `reload-tools` that causes the worker to re-run `loadPersistedTools()`.

**Warning signs:** `Tool "my_new_tool" is not registered` error in worker logs after agent successfully creates the tool.

---

## Code Examples

Verified patterns from official sources:

### esbuild Transform: TypeScript String to JavaScript
```typescript
// Source: esbuild.github.io/api/#transform (HIGH confidence)
import * as esbuild from 'esbuild';

const tsSource = `
  import { z } from 'zod';
  import type { ToolDefinition } from '@jarvis/tools';

  const inputSchema = z.object({ query: z.string() });
  type Input = z.infer<typeof inputSchema>;

  export const tool: ToolDefinition<Input, string> = {
    name: 'my_tool',
    description: 'Does something useful',
    inputSchema,
    timeoutMs: 10_000,
    async execute(input, _signal) {
      return \`Result for: \${input.query}\`;
    },
  };
`;

const result = await esbuild.transform(tsSource, {
  loader: 'ts',
  format: 'esm',
  target: 'node20',
  platform: 'node',
});

// result.code is plain JavaScript — no types, no imports changed
console.log(result.code);
```

### child_process.fork for Sandboxed Execution
```typescript
// Source: nodejs.org/api/child_process.html (HIGH confidence)
import { fork } from 'node:child_process';

// The forked file runs in a completely separate process.
// If it crashes, throws, or times out, the parent is unaffected.
const child = fork('/tmp/sandbox-test.mjs', [], {
  silent: true,  // Capture stdout/stderr; don't inherit parent's streams
});

// Bidirectional IPC
child.send({ action: 'run', input: { query: 'test' } });

child.on('message', (result) => {
  console.log('Sandbox result:', result);
  child.kill();
});

child.on('exit', (code) => {
  console.log('Sandbox exited with code:', code);
});
```

### PostgreSQL Transactional DDL
```typescript
// Source: postgresql.org/docs/current/tutorial-transactions.html (HIGH confidence)
// PostgreSQL DDL is FULLY transactional — unlike MySQL/Oracle
import { pool } from '@jarvis/db';

const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(`
    CREATE TABLE agent_x402_transactions (
      id         INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      service_url TEXT NOT NULL,
      amount_usd  NUMERIC(18, 8) NOT NULL,
      tx_hash     TEXT,
      status      VARCHAR(32) NOT NULL DEFAULT 'pending',
      created_at  TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(
    'INSERT INTO agent_migrations (migration_name, sql_executed) VALUES ($1, $2)',
    ['create_agent_x402_transactions', '<the DDL above>']
  );
  await client.query('COMMIT'); // DDL persists
} catch (err) {
  await client.query('ROLLBACK'); // CREATE TABLE undone — database unchanged
  throw err;
} finally {
  client.release();
}
```

### simple-git Branch Operations
```typescript
// Source: npmjs.com/package/simple-git (HIGH confidence)
import simpleGit from 'simple-git';

const git = simpleGit(process.cwd());

// Create staging branch
await git.checkoutLocalBranch('agent/staging/my-tool');

// ... make changes, commit ...
await git.add('packages/@jarvis/tools/src/shell/index.ts');
await git.commit('agent: update shell tool timeout handling');

// Merge back with fast-forward only (fail if diverged)
await git.checkout('main');
await git.merge(['agent/staging/my-tool', '--ff-only']);
await git.deleteLocalBranch('agent/staging/my-tool');
```

### x402 Client (for when agent self-extends to build payment tool)
```typescript
// Source: docs.cdp.coinbase.com/x402/quickstart-for-buyers (HIGH confidence)
// This code is written BY THE AGENT when it builds its x402 payment tool
import { x402Client, wrapFetchWithPayment } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { privateKeyToAccount } from 'viem/accounts';

const signer = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);
const client = new x402Client();
registerExactEvmScheme(client, { signer });

const fetchWithPayment = wrapFetchWithPayment(fetch, client);

// Automatically handles 402 → payment → retry
const response = await fetchWithPayment('https://api.example.com/paid-data', {
  method: 'GET',
});
const data = await response.json();
```

### agent_migrations Schema Table
```typescript
// Source: codebase patterns (existing Drizzle schema style) (HIGH confidence)
import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const agentMigrations = pgTable('agent_migrations', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  /** Human-readable name: 'create_agent_x402_transactions', 'add_strategy_pnl_column', etc. */
  migrationName: text('migration_name').notNull().unique(),
  /** The exact DDL SQL that was executed — for audit and re-creation */
  sqlExecuted: text('sql_executed').notNull(),
  appliedAt: timestamp('applied_at').defaultNow().notNull(),
});

export type AgentMigration = typeof agentMigrations.$inferSelect;
export type NewAgentMigration = typeof agentMigrations.$inferInsert;
```

---

## Recommendations for Discretion Areas

### Sandbox Isolation Model: child_process.fork (RECOMMENDED)

**Decision:** Use `child_process.fork` over VM module or `isolated-vm`.

**Rationale:**
- Node.js docs explicitly say `node:vm` is "not a security mechanism" — ruled out
- `isolated-vm` gives V8-level isolation but adds a native C++ addon dependency and more complex API
- The agent generates its own tools (trusted source), not arbitrary user code — process-level isolation is sufficient
- `fork` provides a genuine process boundary: crash in child = child dies, parent continues
- Built-in IPC channel (`.send()` / `.on('message')`) handles bidirectional communication
- No new npm dependencies

**Sandbox harness file pattern:** The compiled tool JS exports an `execute()` function. The sandbox harness file (a small wrapper) imports it, calls `execute(testInput, new AbortController().signal)`, sends the result back via `process.send()`, then exits 0. If the tool throws, the harness catches it and exits 1 with error in stderr.

### Migration Tracking: Separate `agent_migrations` Table (RECOMMENDED)

**Decision:** Use a dedicated `agent_migrations` table tracked via raw `pg` connection, NOT `drizzle-kit/api`.

**Rationale:**
- `drizzle-kit/api`'s `pushSchema` function is undocumented (GitHub discussion explicitly says "I couldn't find the docs"), has ESM/CJS interop issues requiring `createRequire` workarounds, and may change without notice
- A simple table with `migration_name` (unique), `sql_executed`, `applied_at` is auditable, queryable, and fully controlled
- The `agent_migrations` table itself is part of the static Drizzle schema (co-located in `packages/@jarvis/db/src/schema/`) — it's a regular table that gets created by `drizzle-kit push` in the normal dev setup
- Agent DDL is applied via raw SQL using an existing `pg` pool connection — same pool, no extra connections

**Note:** Add `agent-migrations.ts` to `packages/@jarvis/db/src/schema/index.ts` AND to `packages/@jarvis/db/drizzle.config.ts` schema array so it's included in `db:push`.

### Rollback Strategy for Failed Tool Deployments (RECOMMENDED)

**Decision:** Write-then-test-then-commit pattern. Never write to the production tool directory before sandbox passes.

**Flow:**
1. Compile TS source in-memory (esbuild.transform)
2. Write compiled JS to `/tmp/sandbox-{toolName}-{ts}.mjs` (temp, not production)
3. Fork child process to run sandbox harness
4. If sandbox fails → clean up temp file → return `{ success: false, error }` to agent
5. If sandbox passes → write TS source to `apps/agent/agent-tools/{toolName}.ts` AND compiled JS to `apps/agent/agent-tools/{toolName}.js`
6. Dynamic import of the production JS path (cache-busting with version suffix)
7. Unregister old version (if exists) + register new tool in ToolRegistry
8. Return `{ success: true }` to agent

**Rollback is implicit:** Nothing is written to production paths until sandbox passes. No explicit undo step needed.

### Git Branch Workflow for Built-In Tool Staging (RECOMMENDED)

**Decision:** Use `simple-git` with branch naming convention `agent/builtin-mod/{toolName}-{timestamp}`.

**Workflow:**
1. `git.checkoutLocalBranch('agent/builtin-mod/shell-1234567890')`
2. Write modified tool source to the tool's actual file path
3. `git.add(filePath)` + `git.commit('agent: ...')`
4. Run sandbox harness with the modified tool (fork test)
5. If test fails → `git.checkout('main')` + `git.deleteLocalBranch(branch, true)` → return error
6. If test passes → `git.checkout('main')` + `git.merge([branch, '--ff-only'])` + `git.deleteLocalBranch(branch)`
7. `pnpm build --filter @jarvis/tools` to recompile modified built-in tool

**Critical:** After merging, the tool source is on disk but the compiled `dist/` is stale until rebuilt. The agent must trigger `pnpm build` via the shell tool before the updated built-in tool is active. Agent-authored tools don't have this issue because they're dynamically imported (not compiled to `dist/`).

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| vm2 for sandboxing | child_process.fork or isolated-vm | 2024-2025 (vm2 CVEs) | vm2 has critical sandbox escape CVEs; community moved away |
| drizzle-kit CLI only | drizzle-kit/api (undocumented programmatic) | 2024 | Programmatic push exists but is unstable API |
| Manual payment protocol | x402 HTTP standard | May 2025 launch | 100M+ payments; Visa + Cloudflare adopted; TypeScript SDKs production-ready |
| x402 v1 | x402 v2 | Late 2025 | V2 adds session support, CAIP-2 identifiers, modular scheme registration |

**Deprecated/outdated:**
- `vm2`: Do not use — multiple CVEs including 2026 critical RCE; maintainer acknowledged ongoing bypass discoveries
- `drizzle-kit push` via CLI in agent runtime: CLI is not callable from within a running Node.js process; use raw SQL instead

---

## Open Questions

1. **Worker process tool synchronization**
   - What we know: `apps/agent/src/worker.ts` has its own ToolRegistry separate from the agent loop process. New tools registered in the loop are not visible to the worker.
   - What's unclear: Should the worker poll disk for new tools periodically, or should a BullMQ signal trigger a reload? Can the worker process use dynamic imports from `agent-tools/` without restart?
   - Recommendation: Implement a `reload-tools` BullMQ job type in the worker. When a new tool is created, the agent loop enqueues a `reload-tools` job. The worker handles it by re-running `loadPersistedTools()`. This avoids worker restart while ensuring synchronization.

2. **esbuild version in pnpm workspace**
   - What we know: esbuild is a transitive dependency of `tsx` (used in devDependencies) and likely of `turbo`. It may not be an explicit direct dependency in any workspace package.
   - What's unclear: pnpm strict isolation means transitive imports are not allowed. Is esbuild accessible from `@jarvis/tools`?
   - Recommendation: Add `esbuild` as an explicit direct dependency to `packages/@jarvis/tools/package.json`. Check current esbuild version with `pnpm why esbuild` first.

3. **x402 EVM private key management**
   - What we know: x402 requires an EVM private key to sign payment payloads (`privateKeyToAccount(process.env.EVM_PRIVATE_KEY)`). The existing wallet package is Solana-based.
   - What's unclear: Does the agent need a separate EVM wallet for x402 payments on Base? This is handled by the agent when it builds the x402 tool, but the key needs to exist somewhere.
   - Recommendation: When the agent builds the x402 tool, it should use the existing wallet credentials infrastructure and add an EVM key to the wallet_config table (using the credential store from Phase 6). This is the agent's decision at runtime, not pre-built infrastructure.

4. **Agent-authored tool naming collisions**
   - What we know: ToolRegistry.register() throws on duplicate names. The agent can call unregister() first.
   - What's unclear: If an agent-authored tool has the same name as a built-in tool (e.g., agent tries to create a tool named "shell"), what happens?
   - Recommendation: The `tool_write` tool should check if the tool name conflicts with a built-in (loaded from static registry factory). If it does, require the agent to use `agent_` prefix or a different name. Document this constraint in the tool description.

---

## Sources

### Primary (HIGH confidence)
- Node.js docs `child_process.fork` — nodejs.org/api/child_process.html — process isolation, IPC, timeout
- esbuild Transform API — esbuild.github.io/api/#transform — in-memory TypeScript compilation
- PostgreSQL transactional DDL — postgresql.org/docs/current/tutorial-transactions.html — DDL in BEGIN/ROLLBACK
- PostgreSQL wiki: Transactional DDL competitive analysis — wiki.postgresql.org/wiki/Transactional_DDL — confirms DDL rollback
- x402 Quickstart for Buyers — docs.cdp.coinbase.com/x402/quickstart-for-buyers — @x402/fetch, @x402/evm API
- Existing codebase: ToolRegistry, invokeWithLogging, bootstrap tools — verified by reading source files

### Secondary (MEDIUM confidence)
- drizzle-kit/api GitHub Discussion #4373 — programmatic pushSchema function signature (MEDIUM: undocumented API, exists but volatile)
- simple-git npm package — npmjs.com/package/simple-git — branch operations API
- x402 GitHub repository — github.com/coinbase/x402 — package names and example structure
- WebSearch: vm2 CVEs and sandbox escape recommendations (MEDIUM: multiple sources agree on avoiding vm/vm2)

### Tertiary (LOW confidence)
- WebSearch: Node.js module cache busting for dynamic imports — single-source, unverified with official docs
- WebSearch: Worker process registry synchronization pattern — pattern inferred from codebase reading + general Node.js knowledge

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — child_process.fork and esbuild are core Node.js/well-documented OSS; PostgreSQL DDL transactions are official docs
- Architecture: HIGH — patterns derived directly from existing codebase (ToolRegistry, invokeWithLogging, pool.connect)
- drizzle-kit/api: MEDIUM — exists but undocumented; recommendation to avoid it is LOW-risk since raw SQL is the safer path
- x402 protocol: HIGH — production-ready since May 2025, 100M+ payments, official SDK docs available
- Pitfalls: HIGH — Node.js module cache, DDL locking, fork-requires-file are all verified against official docs

**Research date:** 2026-02-18
**Valid until:** 2026-03-18 (30 days — Node.js/PostgreSQL APIs stable; x402 evolving but packages versioned; drizzle-kit undocumented API may change)
