# Phase 5: Web Dashboard - Research

**Researched:** 2026-02-18
**Domain:** Full-stack web dashboard — Hono API server + React/Vite SPA + SSE real-time streaming
**Confidence:** HIGH (stack verified via official docs + Context7 cross-reference)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Layout & navigation
- Tabbed single-page app — tabs switch between views, no sidebar
- Default landing tab is an overview summary with compact cards: agent status, recent activity snippet, kill switch
- Clean, minimal visual style — light/neutral theme, generous whitespace, card-based (Linear/Vercel aesthetic)
- Kill switch lives on the overview tab only, not pinned globally

#### Activity feed
- Compact one-liner entries by default: icon + timestamp + short summary
- Click to expand for full details (inputs, outputs, duration, cost)
- Entries grouped by goal/sub-goal — shows structure of what the agent is working on
- Live streaming — new entries appear at the top as they happen, no manual refresh
- Full text search plus type filters (tool calls, AI decisions, wallet transactions, errors)

#### Kill switch & controls
- Overview tab shows: alive/halted status, current goal, uptime, last action timestamp, active strategy
- Kill switch with confirmation dialog ("Are you sure? This will halt all agent activity.")
- Resume button with same confirmation pattern
- No other operator controls beyond status display and kill/resume — keep it minimal

#### Authentication
- Password/token-protected access — prevents unauthorized kill switch use
- Simple auth gate, not a full user system

### Claude's Discretion
- Frontend framework choice (React, Svelte, etc.)
- Real-time transport mechanism (WebSocket, SSE, polling)
- Exact tab structure beyond overview and activity
- Loading states and error handling patterns
- Typography, spacing, color palette within the clean/minimal constraint
- How authentication token is configured and validated

### Deferred Ideas (OUT OF SCOPE)
- P&L visualization (revenue, costs, net over time, strategy breakdown) — agent builds this itself via Phase 8 self-extension
- Chat window to talk to the main agent — new capability, future phase
- Create and manage multiple main agents from dashboard — new capability, future phase
- Strategy history and decision reasoning views — agent extends dashboard when strategy engine exists (Phase 7+)
</user_constraints>

---

**NOTE on requirements vs CONTEXT.md scope:** The phase requirements (DASH-03, DASH-04, DASH-07) reference P&L data, strategy history, and decision logs — but the CONTEXT.md explicitly defers P&L visualization and strategy views. The schema and query functions for P&L (`getPnl`, `getAiSpendSummary`) already exist in `@jarvis/db`. The dashboard should expose these via API endpoints so the data is accessible, but the frontend rendering of P&L charts/tables is deferred to Phase 8. DASH-07 (decision log) is partially in scope as read-only data via the activity feed — the `decision_log` table exists and should be surfaced.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DASH-01 | Dashboard displays real-time agent status (alive, current goal, active strategy) | `agent_state` table key `kill_switch` + `system:status` + active goals query. SSE stream pushes status changes. |
| DASH-02 | Dashboard shows paginated activity feed (decisions, tool calls, outcomes) | `tool_calls`, `decision_log`, `planning_cycles`, `wallet_transactions` tables. Cursor-based pagination via `id` column. Drizzle native cursor pattern applies. |
| DASH-03 | Dashboard shows P&L data with revenue, costs, and net over time | `getPnl()` and `getAiSpendSummary()` functions already exist in `@jarvis/db/pnl-view`. Expose via GET /api/pnl endpoint. Frontend rendering deferred (CONTEXT.md). |
| DASH-04 | Dashboard shows active and historical strategies with per-strategy P&L | `revenue` table has `strategyId` column; `getRevenueTotal(db, strategyId)` exists. Strategy concept not yet fully implemented (Phase 7+). Expose raw data via API; visualization deferred. |
| DASH-05 | Dashboard includes kill switch control button | `activateKillSwitch` / `deactivateKillSwitch` from `@jarvis/ai` already exist. Dashboard calls POST /api/kill-switch with action + reason. Requires auth. |
| DASH-06 | Dashboard streams real-time updates via WebSocket connection | Use SSE (not WebSocket) — simpler, HTTP-native, no protocol upgrade. Hono `streamSSE` helper. EventEmitter broadcast to all connected SSE clients. |
| DASH-07 | Dashboard shows decision log with LLM reasoning for each major decision | `decision_log` table with `reasoning` (JSONB) + `decision` columns. Surfaced in activity feed with expand-for-detail pattern. |
</phase_requirements>

---

## Summary

The dashboard is a new `apps/dashboard` entry in the monorepo. It consists of two parts: a **Hono API server** running on Node.js that serves JSON REST endpoints plus an SSE stream, and a **React + Vite SPA** that the Hono server serves as static files in production. In development, Vite runs on its own port with a proxy configured to forward `/api/*` and `/sse` to the Hono server.

The existing `@jarvis/db` package exposes all the data the dashboard needs: `agent_state` (kill switch state, system status), `goals`, `sub_goals`, `tool_calls`, `decision_log`, `planning_cycles`, `wallet_transactions`, `ai_calls`, `operating_costs`, `revenue`, and the `getPnl`/`getAiSpendSummary` query functions. No new tables are required for Phase 5.

Real-time delivery uses **Server-Sent Events** (not WebSockets). SSE is simpler to implement, uses plain HTTP, auto-reconnects natively in the browser, and is sufficient for this use case (server-to-client only). The Hono API server maintains an in-process `EventEmitter`-based broadcaster: when the agent writes to key tables (detected by polling or triggered by a thin notifier wrapper), the broadcaster fans out to all connected SSE clients.

**Primary recommendation:** New `apps/dashboard` app with `packages/dashboard-api` sub-package split — the Hono server goes in `apps/dashboard` (serving both API and built React files), the React SPA goes in `apps/dashboard` as well under `client/`. Authentication uses Hono's built-in `bearerAuth` middleware with a static token from `DASHBOARD_TOKEN` env var.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `hono` | `^4.x` (latest) | API server + SSE streaming | Web-standard framework, built-in `streamSSE`, `bearerAuth`, `cors` — zero-dep, Node.js via `@hono/node-server` |
| `@hono/node-server` | `^1.x` | Hono Node.js adapter | Official adapter, `serveStatic` included |
| `react` | `^18.x` | Frontend framework | Mature ecosystem, team familiarity implied by monorepo's existing patterns |
| `react-dom` | `^18.x` | DOM renderer | Required companion to React |
| `vite` | `^6.x` | Frontend build + dev server | Standard for React SPA in 2025; fast HMR, proxy support |
| `@vitejs/plugin-react` | `^4.x` | Vite React transform | Official plugin for React JSX |
| `typescript` | `^5.7.x` | Shared with monorepo | Already pinned across all packages |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@tanstack/react-query` | `^5.x` | Server state management for REST endpoints | Handles loading/error/caching for all non-SSE data (agent status snapshot, activity feed pages, P&L summary) |
| `@microsoft/fetch-event-source` | `^2.0.1` | SSE client with custom headers | Native `EventSource` cannot send `Authorization` headers; this fetch-based polyfill supports them — avoids query-string token anti-pattern |
| `zod` | `^3.x` | Schema validation on API server | Already used in `@jarvis/agent`. Validate kill-switch request body. |
| `@hono/zod-validator` | `^0.x` | Hono-native Zod integration | Request body/query validation inline with route definitions |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SSE | WebSocket | WebSocket requires protocol upgrade, bidirectional complexity — overkill for server-to-client streaming. SSE auto-reconnects, HTTP-native. |
| React | Svelte | Svelte is smaller but less tooling alignment with the rest of the codebase. React is safe default. |
| Hono | Express | Express is battle-tested but lacks built-in SSE helpers, weaker TypeScript, no RPC. Hono is the modern choice for new Node.js apps. |
| `@microsoft/fetch-event-source` | `event-source-polyfill` | Both work. `@microsoft/fetch-event-source` is actively maintained and uses the Fetch API. |
| `@tanstack/react-query` | SWR | Both work well. TanStack Query has more features and better TypeScript. |

**Installation (server):**
```bash
pnpm --filter @jarvis/dashboard add hono @hono/node-server @hono/zod-validator zod
```

**Installation (client, inside `apps/dashboard/client`):**
```bash
pnpm --filter @jarvis/dashboard-client add react react-dom @tanstack/react-query @microsoft/fetch-event-source
pnpm --filter @jarvis/dashboard-client add -D vite @vitejs/plugin-react typescript
```

---

## Architecture Patterns

### Recommended Project Structure

```
apps/dashboard/
├── package.json              # name: @jarvis/dashboard, deps: hono, @hono/node-server, @jarvis/db, @jarvis/ai
├── tsconfig.json             # extends @jarvis/typescript-config/base.json
├── src/
│   ├── index.ts              # Entry: serve(app), serveStatic for built client
│   ├── app.ts                # Hono app factory — wires middleware, routes
│   ├── broadcaster.ts        # EventEmitter singleton for SSE fan-out
│   ├── poller.ts             # Polls DB every N seconds, emits to broadcaster
│   ├── routes/
│   │   ├── status.ts         # GET /api/status — agent_state snapshot
│   │   ├── activity.ts       # GET /api/activity — cursor-paginated feed
│   │   ├── kill-switch.ts    # POST /api/kill-switch — activate/deactivate
│   │   ├── pnl.ts            # GET /api/pnl — P&L summary (DASH-03)
│   │   └── sse.ts            # GET /api/sse — SSE stream
│   └── middleware/
│       └── auth.ts           # bearerAuth wrapper reading DASHBOARD_TOKEN
└── client/                   # React SPA (separate pnpm workspace or src subfolder)
    ├── package.json          # name: @jarvis/dashboard-client
    ├── vite.config.ts        # proxy /api/* and /sse to localhost:PORT
    ├── tsconfig.json
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx            # Tab container
        ├── hooks/
        │   ├── useSSE.ts     # fetch-event-source hook, fan-out to context
        │   └── useAgentData.ts # TanStack Query hooks for REST endpoints
        ├── components/
        │   ├── OverviewTab.tsx
        │   ├── ActivityTab.tsx
        │   ├── KillSwitchButton.tsx
        │   └── ActivityFeed.tsx
        └── lib/
            └── api.ts         # Typed fetch wrappers (or Hono hc client)
```

**Monorepo integration:** Add `apps/dashboard` and `apps/dashboard/client` to `pnpm-workspace.yaml` (already covered by `apps/*`). The server (`@jarvis/dashboard`) depends on `@jarvis/db` and `@jarvis/ai` via `workspace:*`. The client (`@jarvis/dashboard-client`) has no workspace deps — it calls the HTTP API.

### Pattern 1: Hono API Server with SSE Broadcasting

**What:** The Hono server exposes REST endpoints for snapshot data and one SSE endpoint that keeps all clients updated in real time.

**When to use:** When server pushes are one-directional, HTTP-native delivery is preferred, and client count is small (operator dashboard, not consumer-scale).

```typescript
// Source: hono.dev/docs/helpers/streaming
// src/broadcaster.ts
import { EventEmitter } from 'node:events';
export const broadcaster = new EventEmitter();
broadcaster.setMaxListeners(100); // increase for many concurrent dashboard tabs

// src/routes/sse.ts
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { broadcaster } from '../broadcaster.js';

const app = new Hono();
let clientId = 0;

app.get('/', (c) => {
  return streamSSE(c, async (stream) => {
    const id = ++clientId;

    const handler = async (event: string, data: unknown) => {
      await stream.writeSSE({
        event,
        data: JSON.stringify(data),
        id: String(id),
      });
    };

    // Send initial snapshot on connect
    await stream.writeSSE({ event: 'connected', data: JSON.stringify({ clientId: id }) });

    broadcaster.on('update', handler);

    // Heartbeat to keep connection alive through proxies (every 30s)
    const heartbeat = setInterval(async () => {
      await stream.writeSSE({ data: '', comment: 'heartbeat' });
    }, 30_000);

    stream.onAbort(() => {
      broadcaster.off('update', handler);
      clearInterval(heartbeat);
    });

    // Keep stream open indefinitely
    await new Promise<void>((resolve) => {
      stream.onAbort(resolve);
    });
  });
});

export default app;
```

```typescript
// src/poller.ts — polls DB for changes and emits to broadcaster
import { db, agentState, goals, toolCalls, eq, desc } from '@jarvis/db';
import { broadcaster } from './broadcaster.js';

export function startPoller(intervalMs = 2000): NodeJS.Timeout {
  return setInterval(async () => {
    try {
      // Read kill switch + system status
      const [killSwitchRow] = await db.select().from(agentState)
        .where(eq(agentState.key, 'kill_switch')).limit(1);
      const [statusRow] = await db.select().from(agentState)
        .where(eq(agentState.key, 'system:status')).limit(1);

      broadcaster.emit('update', 'status', {
        killSwitch: killSwitchRow?.value,
        systemStatus: statusRow?.value,
      });

      // Latest tool call for activity feed
      const [latest] = await db.select().from(toolCalls)
        .orderBy(desc(toolCalls.id)).limit(1);
      if (latest) {
        broadcaster.emit('update', 'activity', latest);
      }
    } catch (err) {
      // Non-fatal: log and continue
      process.stderr.write(`[dashboard-poller] Error: ${String(err)}\n`);
    }
  }, intervalMs);
}
```

### Pattern 2: Hono Bearer Auth Middleware

**What:** All routes under `/api/*` require `Authorization: Bearer <token>`. Token is configured via `DASHBOARD_TOKEN` env var and validated at middleware level, not per-route.

**When to use:** Simple single-token auth gate without user management.

```typescript
// Source: hono.dev/docs/middleware/builtin/bearer-auth
// src/middleware/auth.ts
import { bearerAuth } from 'hono/bearer-auth';

export function createAuthMiddleware() {
  const token = process.env.DASHBOARD_TOKEN;
  if (!token) throw new Error('DASHBOARD_TOKEN env var required');

  return bearerAuth({
    verifyToken: async (incoming) => {
      return incoming === token;
    },
  });
}

// src/app.ts — wire auth before routes
import { cors } from 'hono/cors';
import { createAuthMiddleware } from './middleware/auth.js';
import statusRoutes from './routes/status.js';
import activityRoutes from './routes/activity.js';
import killSwitchRoutes from './routes/kill-switch.js';
import sseRoutes from './routes/sse.js';

const app = new Hono();

app.use('/api/*', cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.DASHBOARD_ORIGIN ?? 'http://localhost:3000'
    : '*',
  allowHeaders: ['Authorization', 'Content-Type'],
}));

app.use('/api/*', createAuthMiddleware());

app.route('/api/status', statusRoutes);
app.route('/api/activity', activityRoutes);
app.route('/api/kill-switch', killSwitchRoutes);
app.route('/api/sse', sseRoutes);

export default app;
```

### Pattern 3: React Client SSE with Custom Headers

**What:** Native `EventSource` cannot send `Authorization` headers. Use `@microsoft/fetch-event-source` which wraps the Fetch API and supports full request headers.

**When to use:** Any SSE connection that requires authentication headers.

```typescript
// Source: https://www.npmjs.com/package/@microsoft/fetch-event-source
// client/src/hooks/useSSE.ts
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { useEffect, useRef } from 'react';

interface SSEOptions {
  token: string;
  onStatus?: (data: unknown) => void;
  onActivity?: (data: unknown) => void;
}

export function useSSE({ token, onStatus, onActivity }: SSEOptions) {
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    fetchEventSource('/api/sse', {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
      onmessage(ev) {
        try {
          const data = JSON.parse(ev.data);
          if (ev.event === 'status') onStatus?.(data);
          if (ev.event === 'activity') onActivity?.(data);
        } catch { /* ignore parse errors */ }
      },
      onerror(err) {
        // fetchEventSource handles reconnection automatically
        // throw to stop reconnecting on auth error (401)
        if (err instanceof Error && err.message.includes('401')) throw err;
      },
    });

    return () => controller.abort();
  }, [token]);
}
```

### Pattern 4: Cursor-Based Activity Feed Pagination

**What:** The activity feed combines rows from `tool_calls`, `decision_log`, `planning_cycles`, and `wallet_transactions` in reverse-chronological order, using cursor-based pagination on `id`.

**When to use:** Live-updating feeds where rows are inserted frequently and offset pagination would produce duplicate/skipped rows.

```typescript
// Source: orm.drizzle.team/docs/guides/cursor-based-pagination
// src/routes/activity.ts
import { Hono } from 'hono';
import { db, toolCalls, decisionLog, desc, lt } from '@jarvis/db';

const app = new Hono();

app.get('/', async (c) => {
  const cursor = c.req.query('cursor'); // last seen id
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 100);

  const rows = await db.select()
    .from(toolCalls)
    .where(cursor ? lt(toolCalls.id, Number(cursor)) : undefined)
    .orderBy(desc(toolCalls.id))
    .limit(limit);

  const nextCursor = rows.length === limit ? rows[rows.length - 1]!.id : null;
  return c.json({ rows, nextCursor });
});
```

### Pattern 5: Vite Dev Proxy for SSE

**What:** During development, Vite's proxy forwards SSE requests to the Hono server with correct keepalive settings.

```typescript
// Source: vite.dev/config/server-options + github.com/vitejs/vite/discussions/10851
// client/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        // SSE requires long-lived connections — set generous timeout
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            if (req.headers.accept === 'text/event-stream') {
              proxyReq.setHeader('Connection', 'Keep-Alive');
            }
          });
        },
      },
    },
  },
  build: {
    outDir: '../dist/client', // output next to server dist
  },
});
```

### Pattern 6: Kill Switch Route with Zod Validation

```typescript
// Source: hono.dev/docs/middleware/builtin/bearer-auth + @hono/zod-validator
// src/routes/kill-switch.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '@jarvis/db';
import { activateKillSwitch, deactivateKillSwitch } from '@jarvis/ai';
import { broadcaster } from '../broadcaster.js';

const killSwitchSchema = z.object({
  action: z.enum(['activate', 'deactivate']),
  reason: z.string().min(1).max(500),
});

const app = new Hono();

app.post('/', zValidator('json', killSwitchSchema), async (c) => {
  const { action, reason } = c.req.valid('json');

  if (action === 'activate') {
    await activateKillSwitch(db, reason, 'dashboard');
  } else {
    await deactivateKillSwitch(db, reason, 'dashboard');
  }

  // Immediately broadcast status change to all SSE clients
  broadcaster.emit('update', 'status', { killSwitchAction: action });

  return c.json({ ok: true, action });
});
```

### Anti-Patterns to Avoid

- **Query-string auth tokens for SSE:** Leaks tokens in server logs and browser history. Use `@microsoft/fetch-event-source` with `Authorization` header instead.
- **Polling from the frontend:** Don't poll REST endpoints for activity updates. Use the SSE stream for real-time delivery and REST only for initial loads.
- **Offset-based pagination for activity feed:** The feed is live-updating; offset pagination skips/duplicates rows. Always use cursor (id-based) pagination.
- **Importing `@jarvis/ai` in the client package:** The client is a browser SPA — it must not import server-side packages. All server logic stays in the Hono routes.
- **Serving the Vite dev server in production:** In production, Hono's `serveStatic` serves the `vite build` output. The Vite dev server is dev-only.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE with auth headers | Custom fetch loop | `@microsoft/fetch-event-source` | Native EventSource can't send Authorization; hand-rolled fetch loops miss reconnect logic, error handling, and last-event-id |
| API token auth | Custom middleware | `bearerAuth` from `hono/bearer-auth` | Handles timing-safe comparison, WWW-Authenticate headers, correct 401/403 responses |
| Request validation | Manual `req.json()` + conditionals | `@hono/zod-validator` + Zod | Type-safe + runtime validated in one step; errors return correct 422 responses |
| Frontend data fetching | `useEffect` + `useState` + `fetch` | `@tanstack/react-query` | Handles caching, loading/error states, refetch on focus, retry logic — eliminates entire categories of bugs |
| CORS configuration | Manual headers | `cors` from `hono/cors` | Handles preflight OPTIONS, credential headers, origin validation correctly |

**Key insight:** The SSE auth problem is a known browser API limitation — the native `EventSource` spec doesn't support custom headers and this will not be fixed. Using a polyfill is not a workaround, it is the correct solution.

---

## Common Pitfalls

### Pitfall 1: SSE Close Event Not Forwarded Through Vite Proxy

**What goes wrong:** When running in dev with Vite proxy, the browser's close event (e.g., page refresh) is not forwarded to the Hono server. SSE connections accumulate and are never cleaned up. After many refreshes, dozens of ghost connections exist server-side.

**Why it happens:** Vite's proxy middleware does not forward the TCP close signal correctly for long-lived SSE connections.

**How to avoid:** Use `stream.onAbort()` in Hono's `streamSSE` to clean up resources. The abort fires when Hono detects the connection is gone (even if late). Also use heartbeats (`": keep-alive\n\n"` every 30s) to detect dead connections faster. Set `maxListeners` on the EventEmitter.

**Warning signs:** `ps aux` shows growing memory, broadcaster EventEmitter warning about listener leak.

---

### Pitfall 2: pnpm Strict Isolation — `@jarvis/db` Transitive Deps

**What goes wrong:** The dashboard server imports `@jarvis/db`, which depends on `drizzle-orm` and `pg`. In pnpm's strict isolation mode, `@jarvis/dashboard` must explicitly declare these if it uses them directly. Otherwise, build succeeds but runtime crashes with "Cannot find module 'pg'".

**Why it happens:** pnpm doesn't hoist undeclared transitive deps. If dashboard code only uses `@jarvis/db`'s exports, it's fine. If it imports directly from `drizzle-orm` (e.g., `import { eq } from 'drizzle-orm'`), it must add `drizzle-orm` to its own deps.

**How to avoid:** Verify the `@jarvis/db` package re-exports all needed utilities (it already does: `export { sql, eq, and, or, desc, asc, gt, gte, lt, lte, isNull, isNotNull } from 'drizzle-orm'`). Import these from `@jarvis/db`, not from `drizzle-orm` directly.

**Warning signs:** TypeScript compiles fine, Node.js crashes on startup with module resolution error.

---

### Pitfall 3: Vite Build Output Path Must Align with Hono's serveStatic Root

**What goes wrong:** Hono's `serveStatic` needs to find the Vite build output. If the `outDir` in `vite.config.ts` and the `root` in `serveStatic` don't align, production serving fails silently (404 for all frontend routes).

**Why it happens:** The Vite build and the Hono server are in the same `apps/dashboard` folder but have different output paths (`client/dist` vs `server/dist`).

**How to avoid:** Set `build.outDir` in `vite.config.ts` to a path that is predictable relative to the server. Recommended: `../public` relative to `client/`, which places the SPA assets at `apps/dashboard/public/`. Then `serveStatic({ root: 'public/' })` works from the server's working directory.

**Warning signs:** `curl http://localhost:3001/` returns 404 in production but works in dev.

---

### Pitfall 4: NodeNext Module Resolution and `.js` Extensions

**What goes wrong:** The monorepo uses `"module": "NodeNext"` in all `tsconfig.json` files. Import statements in `.ts` files must use `.js` extensions (e.g., `import { foo } from './foo.js'`). Missing extensions cause runtime `ERR_MODULE_NOT_FOUND`.

**Why it happens:** NodeNext module resolution is spec-compliant — it does not rewrite imports. The `.js` extension in the source refers to the compiled `.js` output file.

**How to avoid:** Already established convention in this codebase. Follow the same pattern — all imports in the dashboard server use `.js` extensions.

**Warning signs:** TypeScript compiles, Node.js throws `ERR_MODULE_NOT_FOUND` at runtime.

---

### Pitfall 5: Hono RPC Types Don't Cover SSE Endpoints

**What goes wrong:** Hono's `hc` RPC client provides type-safe API calls for JSON endpoints. SSE endpoints (returning `text/event-stream`) are not covered by RPC type inference. If you try to call the SSE endpoint via `hc`, you get a plain `Response`, not typed SSE.

**Why it happens:** RPC type inference is designed for request/response JSON patterns, not streaming responses.

**How to avoid:** Use typed manual fetch wrappers for the SSE endpoint. Use Hono RPC (`hc` + exported `AppType`) only for the JSON REST endpoints where it adds value. The SSE client uses `fetchEventSource` directly.

---

### Pitfall 6: Activity Feed Union Across Multiple Tables

**What goes wrong:** The activity feed combines rows from `tool_calls`, `decision_log`, `wallet_transactions`, and `planning_cycles`. Implementing a true SQL UNION with cursor pagination across all four tables is complex.

**Why it happens:** Each table has different columns; union requires a common shape; cursor on `id` works only within one table.

**How to avoid:** For Phase 5, keep the activity feed as separate tab views (e.g., "All" shows tool calls, "Decisions" shows decision_log, "Wallet" shows wallet_transactions) rather than a true multi-table union. Alternatively, implement a unified feed by fetching the last N rows from each table sorted by `createdAt`, merging in memory, and paginating on `createdAt` + table name as composite cursor. The simplest correct approach is separate queries merged client-side for the initial implementation.

---

## Code Examples

Verified patterns from official sources:

### Hono Node.js Server Entry Point

```typescript
// Source: hono.dev/docs/getting-started/nodejs
// apps/dashboard/src/index.ts
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import app from './app.js';

const PORT = Number(process.env.DASHBOARD_PORT ?? 3001);

// In production, serve the Vite build output
app.use('/*', serveStatic({ root: './public' }));

// SPA fallback — serve index.html for all non-API routes
app.get('/*', serveStatic({ path: './public/index.html' }));

serve({ fetch: app.fetch, port: PORT }, (info) => {
  process.stderr.write(`[dashboard] Listening on http://localhost:${info.port}\n`);
});
```

### Status API Endpoint

```typescript
// apps/dashboard/src/routes/status.ts
import { Hono } from 'hono';
import { db, agentState, goals, eq } from '@jarvis/db';

const app = new Hono();

app.get('/', async (c) => {
  const [killSwitchRow] = await db.select().from(agentState)
    .where(eq(agentState.key, 'kill_switch')).limit(1);
  const [systemStatusRow] = await db.select().from(agentState)
    .where(eq(agentState.key, 'system:status')).limit(1);

  const activeGoals = await db.select().from(goals)
    .where(eq(goals.status, 'active'));

  const killSwitchValue = killSwitchRow?.value as { active?: boolean; activatedAt?: string } | undefined;

  return c.json({
    isHalted: killSwitchValue?.active === true,
    activatedAt: killSwitchValue?.activatedAt ?? null,
    systemStatus: systemStatusRow?.value,
    activeGoals: activeGoals.map(g => ({
      id: g.id,
      description: g.description,
      priority: g.priority,
    })),
  });
});

export default app;
```

### P&L Summary Endpoint

```typescript
// Source: packages/db/src/schema/pnl-view.ts (getPnl function)
// apps/dashboard/src/routes/pnl.ts
import { Hono } from 'hono';
import { db, getPnl, getAiSpendSummary } from '@jarvis/db';

const app = new Hono();

app.get('/', async (c) => {
  const sinceParam = c.req.query('since');
  const since = sinceParam ? new Date(sinceParam) : undefined;

  const [pnl, aiSpend] = await Promise.all([
    getPnl(db, { since }),
    getAiSpendSummary(db),
  ]);

  return c.json({ pnl, aiSpend });
});

export default app;
```

### TanStack Query Hook for Status

```typescript
// Source: tanstack.com/query/latest
// client/src/hooks/useAgentData.ts
import { useQuery } from '@tanstack/react-query';

async function fetchStatus(token: string) {
  const res = await fetch('/api/status', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export function useAgentStatus(token: string) {
  return useQuery({
    queryKey: ['agent-status'],
    queryFn: () => fetchStatus(token),
    refetchInterval: 5_000, // fallback polling if SSE misses update
    staleTime: 2_000,
  });
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Express + socket.io for real-time | Hono + SSE (or WS) | 2023+ | Dramatically simpler setup, standard HTTP, no ws:// protocol needed |
| Native `EventSource` for authenticated SSE | `@microsoft/fetch-event-source` | 2020+ | Enables Authorization header — the only correct solution |
| Redux for server state | TanStack Query | 2021+ | Eliminates hand-rolled caching, loading, error states |
| CRA (Create React App) | Vite | 2022+ | 10-100x faster HMR, modern build pipeline |
| npm/yarn workspaces | pnpm workspaces | 2022+ | Strict isolation prevents phantom deps, shared content-addressed store |

**Deprecated/outdated:**
- `socket.io`: Still works but adds complexity, protocol overhead. SSE is sufficient for operator dashboards.
- `EventSource` for authenticated endpoints: Cannot send Authorization header — use `fetch-event-source` instead.
- Offset pagination for live feeds: Produces gaps/duplicates on active tables — use cursor pagination.

---

## Open Questions

1. **Port allocation for dashboard server**
   - What we know: Agent runs on no public port (it's a process). CLI has no port. Docker-compose maps Postgres to 5433, Redis to 6379.
   - What's unclear: Is there a preferred port for the dashboard API server? 3001 is unused but unconfirmed.
   - Recommendation: Use `DASHBOARD_PORT` env var defaulting to `3001`. Document in `.env.example`.

2. **Dashboard app placement in monorepo: one or two packages?**
   - What we know: The Hono server and React SPA can live in one package (`apps/dashboard`) with the server serving the SPA's built output. Or they can be two separate packages.
   - What's unclear: Whether Turborepo's `build` dependency graph needs them split to parallelize.
   - Recommendation: One package (`apps/dashboard`) with a `client/` subdirectory. Server build (`tsc`) and client build (`vite build`) run sequentially via `build` script. Simpler than two packages.

3. **Real-time delivery gap: polling interval vs. SSE latency**
   - What we know: The broadcaster polls Postgres every 2 seconds. Kill switch action is immediately broadcast via the broadcaster (no polling delay).
   - What's unclear: Whether 2-second polling lag for activity feed is acceptable.
   - Recommendation: 2 seconds is fine for an operator dashboard. For the kill switch, broadcast immediately after DB write (the route does this directly). Activity feed can lag 2 seconds.

4. **Authentication token delivery to the React app**
   - What we know: The token must get from the environment into the browser somehow. The CONTEXT.md says "simple auth gate."
   - What's unclear: Is a login form with a password input preferred, or a token embedded in the URL/config?
   - Recommendation: Simple login form that accepts a password, stores it in `sessionStorage` or `localStorage`. On submit, try a GET /api/status with that token — if 200, authenticated; if 401, show error. This avoids JWTs entirely. The "token" is just the raw `DASHBOARD_TOKEN` value entered by the operator.

---

## Sources

### Primary (HIGH confidence)
- `hono.dev/docs/helpers/streaming` — `streamSSE` API, `writeSSE`, `onAbort`, heartbeat pattern
- `hono.dev/docs/middleware/builtin/bearer-auth` — `bearerAuth`, `verifyToken` callback
- `hono.dev/docs/middleware/builtin/cors` — `cors` middleware options
- `hono.dev/docs/getting-started/nodejs` — `@hono/node-server`, `serve()`, `serveStatic`
- `hono.dev/docs/guides/rpc` — `hc` client, `AppType` export, monorepo type sharing
- `hono.dev/docs/guides/best-practices` — `app.route()`, feature-split file structure
- `orm.drizzle.team/docs/guides/cursor-based-pagination` — cursor pagination with `gt`/`lt`
- `packages/db/src/schema/pnl-view.ts` — `getPnl`, `getAiSpendSummary` functions (codebase verified)
- `packages/ai/src/kill-switch.ts` — `activateKillSwitch`, `deactivateKillSwitch` (codebase verified)
- `packages/db/src/schema/*.ts` — all table schemas verified directly

### Secondary (MEDIUM confidence)
- `@microsoft/fetch-event-source` npm page — SSE with custom headers (widely used, actively maintained)
- `tanstack.com/query/latest` — `useQuery`, `refetchInterval` patterns
- `github.com/vitejs/vite/discussions/10851` — Vite proxy SSE configuration workaround (community-verified)
- `vite.dev/config/server-options` — proxy configuration

### Tertiary (LOW confidence)
- Medium articles on Hono + Vite production serving — patterns verified against official Hono Node.js docs
- SSE close event Vite proxy bug (issues #12157, #13522) — community reports; workaround is `stream.onAbort()` cleanup

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Hono, React, Vite all verified against official docs; versions from npm
- Architecture: HIGH — patterns derived from official Hono docs + existing codebase structure (monorepo conventions already established)
- Pitfalls: MEDIUM-HIGH — SSE/Vite proxy pitfall is documented in multiple GitHub issues; NodeNext pitfall is codebase-verified; others are reasoning-based
- P&L/strategy data: HIGH — existing `getPnl`, `getAiSpendSummary`, `revenue` schema all verified in codebase

**Research date:** 2026-02-18
**Valid until:** 2026-03-18 (30 days — stable frameworks, SSE patterns unlikely to change)
