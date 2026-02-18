# Phase 2: AI Backbone and Safety - Research

**Researched:** 2026-02-18
**Domain:** OpenRouter API routing, kill switch persistence, cost tracking
**Confidence:** HIGH (core APIs verified via official docs; architecture patterns verified against existing codebase)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Model routing
- Three tiers: strong, mid, cheap
- Strong: `anthropic/claude-opus-4.6`, Mid: `anthropic/claude-sonnet-4.5`, Cheap: `x-ai/grok-4.1-fast`
- Model-to-tier mapping is runtime configurable (DB or config) — swap models without redeploying
- Callers can request a minimum tier (e.g., planning step requests "strong"), but the router picks the specific model
- All model calls logged with model name, token counts, and cost

#### Kill switch
- Graceful wind-down: in-flight operations finish, no new ones start, agent completes current step then halts
- Blocks everything: tool calls AND AI model calls. Agent is fully frozen — can't think or act
- Activated via database flag + CLI commands (`jarvis kill` / `jarvis resume`) before dashboard exists (Phase 5)
- Every activation/deactivation requires a reason string logged to audit trail
- Kill switch state persists across process restarts

#### Cost tracking
- All AI routed through OpenRouter — agent has its own OpenRouter account with prepaid credits
- No artificial spend limits — the prepaid credit balance is the natural limit
- Agent monitors its own OpenRouter credit balance via their API
- When credits run low, agent gracefully winds down current work
- Agent DMs operator on Discord (via bot) warning that credits need topping up
- Runs 24/7; operator tops up credits as needed (agent funds itself from earnings in later phases)

### Claude's Discretion
- Routing decision algorithm (task-type mapping, complexity scoring, or hybrid)
- Fallback behavior when a model/provider fails (retry vs fall to next provider)
- Cost tracking granularity (per-call, per-goal, or both)
- API key management approach (env var vs encrypted DB storage)
- Exact threshold for "credits running low" warning
- Discord bot setup details

### Deferred Ideas (OUT OF SCOPE)
- Context-length awareness: agent and sub-agents track context usage, at 80% they save state to DB and spin up a fresh agent to continue (avoids context rot) — Phase 3 (Autonomous Loop)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MODL-01 | Agent routes LLM calls to different models based on task type | Provider interface pattern + tier enum in DB/config |
| MODL-02 | Each model call logs model used, input tokens, output tokens, and estimated cost | OpenRouter usage object includes all these fields in every response |
| MODL-03 | Complex reasoning tasks route to high-capability models (Claude Opus/Sonnet) | Tier enum maps "strong" -> claude-opus-4.6, "mid" -> claude-sonnet-4.5 |
| MODL-04 | Simple classification and formatting tasks route to cheap models | Tier enum maps "cheap" -> grok-4.1-fast |
| MODL-05 | Router supports adding new model providers without core changes | Generic `AiProvider` interface; OpenRouter is first implementation |
| KILL-01 | Operator can activate kill switch via dashboard or direct database flag | Boolean column in `agent_state` KV store; CLI writes it directly |
| KILL-02 | Agent checks kill switch at the start of each planning cycle | KillSwitchGuard.check() called before every AI call and tool call |
| KILL-03 | When kill switch is active, agent halts all tool execution immediately | TOOL-06 gate: invokeWithLogging wraps KillSwitchGuard.check() |
| KILL-04 | Kill switch state persists across agent restarts | DB-backed flag (agent_state table) survives process restart |
| TOOL-06 | Every tool call is checked against kill switch before execution | Wrap existing invokeWithLogging with kill switch pre-check |
| COST-01 | AI model API spend is tracked per call with model, tokens, and cost | New `ai_calls` table; populated from OpenRouter response.usage |
| COST-02 | Total operating costs (VM, API, services) are aggregated and queryable | `operating_costs` table with category enum; AI calls auto-insert |
| COST-03 | Revenue is tracked per strategy with source attribution | `revenue` table with strategy_id and source; Phase 2 is schema-only |
| COST-04 | P&L (revenue minus costs) is computed and available via dashboard | SQL view: SUM(revenue) - SUM(costs); queryable by agent via db tool |
| COST-05 | Agent can query its own P&L to inform planning decisions | P&L exposed as a queryable DB view the agent can read via TOOL-04 |
</phase_requirements>

---

## Summary

Phase 2 builds three interlocking systems on top of the Phase 1 foundation: an AI model router, a kill switch, and a cost ledger. All three must be in place before the agent can operate autonomously in Phase 3, because the autonomous loop needs to think (router), stop safely (kill switch), and stay within budget (cost tracking).

The OpenRouter API is fully OpenAI-compatible, so the router can use the standard OpenAI TypeScript SDK pointed at `https://openrouter.ai/api/v1`. Every response already includes a `usage` object with `cost`, `prompt_tokens`, `completion_tokens`, and `total_tokens` — no extra API calls needed for per-call cost tracking. The cost field is in USD credits.

The kill switch is best implemented as a single row in the existing `agent_state` KV table (`key = 'kill_switch'`). This gives it automatic persistence across restarts (Phase 1 already built this table) and lets the existing `@jarvis/db` client read it. The CLI commands (`jarvis kill` / `jarvis resume`) write this row directly. A synchronous in-memory cache with a short TTL (1-2 seconds) avoids hitting Postgres on every single AI and tool call without creating significant staleness risk.

**Primary recommendation:** Use `openai` npm package pointed at OpenRouter (not `@openrouter/sdk`) — this keeps the abstraction clean since the provider interface accepts any OpenAI-compatible base URL, and it is already battle-tested. Implement `AiProvider` interface with `OpenRouterProvider` as the first implementation. Store tier-to-model mapping in a JSON config file loaded at startup (simpler than DB for this phase; can be migrated to DB later without changing the interface).

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `openai` | ^4.x | OpenAI-compatible HTTP client, used to call OpenRouter | Official SDK; OpenRouter is fully compatible; avoids vendor lock-in |
| `discord.js` | ^14.x | Discord bot client for operator DM notifications | Official, TypeScript-native, v14 is current stable |
| `commander` | ^12.x | CLI framework for `jarvis kill` / `jarvis resume` commands | De-facto Node.js CLI standard; TypeScript definitions built-in |
| `drizzle-orm` | ^0.40.0 | Already in use; new schema tables added | Existing project standard (Phase 1) |
| `zod` | ^3.24.x | Already in use; validates model config at load time | Existing project standard (Phase 1) |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@openrouter/ai-sdk-provider` | ^2.x | Alternative: Vercel AI SDK provider for OpenRouter | Only if switching to Vercel AI SDK in a future phase |
| `@openrouter/sdk` | latest | Official OpenRouter SDK (ESM only, auto-generated) | Only if OpenRouter-specific features needed beyond OpenAI compat |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `openai` SDK pointed at OpenRouter | `@openrouter/sdk` | `@openrouter/sdk` is ESM-only and auto-generated; the `openai` SDK is more stable, and the provider abstraction means swapping is trivial later |
| `openai` SDK | Vercel AI SDK (`ai` + `@openrouter/ai-sdk-provider`) | Vercel AI SDK has a richer streaming/tool-calling DX but adds a dependency; the `openai` SDK is lower-level and sufficient for what the agent needs in Phase 2 |
| `commander` | `yargs` | Both are fine; `commander` is lighter and more idiomatic for simple subcommands |
| DB-backed model config | Config file (`model-tiers.json`) | DB is runtime-configurable without restart but adds complexity; a JSON config file loaded at startup is sufficient for Phase 2 — the `AiProvider` interface hides the loading mechanism |

**Installation (new packages only):**
```bash
pnpm add openai discord.js commander
```

---

## Architecture Patterns

### Recommended Project Structure

New package: `packages/ai` (AI router and provider abstraction)
New package: `packages/cli` (jarvis CLI binary)

```
packages/ai/
├── src/
│   ├── provider.ts          # AiProvider interface (generic)
│   ├── openrouter.ts        # OpenRouterProvider implements AiProvider
│   ├── router.ts            # ModelRouter: tier resolution + call dispatch
│   ├── kill-switch.ts       # KillSwitchGuard: DB-backed, cached
│   ├── cost-monitor.ts      # Credit balance polling + Discord DM
│   ├── config.ts            # ModelTierConfig loader and validator
│   └── index.ts             # Public exports
└── package.json

packages/cli/
├── src/
│   ├── index.ts             # commander program entry point
│   ├── commands/
│   │   ├── kill.ts          # jarvis kill <reason>
│   │   └── resume.ts        # jarvis resume <reason>
└── package.json

packages/db/src/schema/
├── ai-calls.ts              # MODL-02, COST-01: per-call AI usage log
├── operating-costs.ts       # COST-02: aggregated cost ledger
├── revenue.ts               # COST-03: revenue tracking (schema only in Phase 2)
└── kill-switch-audit.ts     # KILL-01: activation/deactivation audit log
```

The existing `agent_state` table (key-value store) holds the live kill switch flag. The new `kill_switch_audit` table holds the immutable history of activations.

### Pattern 1: AiProvider Interface (MODL-05)

**What:** Generic interface all AI providers implement. Callers never touch OpenRouter directly — they call `ModelRouter`, which calls the active provider.

**When to use:** Every AI model call in the agent goes through this.

```typescript
// packages/ai/src/provider.ts
// Source: architecture decision; no external library

export interface CompletionRequest {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  model: string;           // exact OpenRouter model ID, e.g. "anthropic/claude-opus-4.6"
  temperature?: number;
  maxTokens?: number;
  stream?: false;          // Phase 2: non-streaming only; streaming in Phase 3
}

export interface CompletionUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;         // from OpenRouter response.usage.cost
}

export interface CompletionResponse {
  content: string;
  model: string;           // actual model used (may differ if fallback triggered)
  usage: CompletionUsage;
}

export interface AiProvider {
  complete(req: CompletionRequest): Promise<CompletionResponse>;
}
```

### Pattern 2: ModelRouter with Tier Resolution (MODL-01, MODL-02, MODL-03, MODL-04)

**What:** Resolves a tier name ("strong" | "mid" | "cheap") to a concrete model ID, delegates to the provider, then logs the result.

**When to use:** Every time the agent needs to call an LLM.

```typescript
// packages/ai/src/router.ts
// Source: architecture decision based on CONTEXT.md decisions

export type Tier = 'strong' | 'mid' | 'cheap';

export interface ModelTierConfig {
  strong: string;  // e.g. "anthropic/claude-opus-4.6"
  mid: string;     // e.g. "anthropic/claude-sonnet-4.5"
  cheap: string;   // e.g. "x-ai/grok-4.1-fast"
}

export class ModelRouter {
  constructor(
    private provider: AiProvider,
    private config: ModelTierConfig,
    private db: DbClient,
    private killSwitch: KillSwitchGuard,
  ) {}

  async complete(
    messages: CompletionRequest['messages'],
    tier: Tier,
    context?: { goalId?: number },
  ): Promise<CompletionResponse> {
    // KILL-02: Check kill switch before any AI call
    await this.killSwitch.assertActive();

    const modelId = this.config[tier];
    const req: CompletionRequest = { messages, model: modelId };

    const response = await this.provider.complete(req);

    // MODL-02, COST-01: Log the call with full usage
    await logAiCall(this.db, {
      model: response.model,
      tier,
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      costUsd: response.usage.costUsd,
      goalId: context?.goalId ?? null,
    });

    return response;
  }
}
```

### Pattern 3: OpenRouterProvider using openai SDK (MODL-05)

**What:** Implements `AiProvider` using the `openai` npm package pointed at OpenRouter's endpoint.

```typescript
// packages/ai/src/openrouter.ts
// Source: https://openrouter.ai/docs/quickstart (verified)

import OpenAI from 'openai';
import type { AiProvider, CompletionRequest, CompletionResponse } from './provider.js';

export class OpenRouterProvider implements AiProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey,
      defaultHeaders: {
        'HTTP-Referer': 'https://jarvis.internal',
        'X-Title': 'Jarvis Agent',
      },
    });
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const response = await this.client.chat.completions.create({
      model: req.model,
      messages: req.messages,
      temperature: req.temperature,
      max_tokens: req.maxTokens,
      stream: false,
    });

    const choice = response.choices[0];
    const usage = response.usage!;

    return {
      content: choice.message.content ?? '',
      model: response.model,
      usage: {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
        // OpenRouter includes cost in USD in the usage object
        // Source: https://openrouter.ai/docs/guides/guides/usage-accounting
        costUsd: (usage as unknown as { cost?: number }).cost ?? 0,
      },
    };
  }
}
```

### Pattern 4: KillSwitchGuard — DB-backed with In-Memory Cache (KILL-01 through KILL-04)

**What:** Reads kill switch state from `agent_state` table. Caches result for 1 second to avoid per-call DB round-trips. Cache TTL is short enough that a `jarvis kill` command takes effect within ~1 second.

```typescript
// packages/ai/src/kill-switch.ts

export class KillSwitchGuard {
  private cachedState: { active: boolean; expiresAt: number } | null = null;
  private readonly TTL_MS = 1000;

  constructor(private db: DbClient) {}

  async isActive(): Promise<boolean> {
    const now = Date.now();
    if (this.cachedState && now < this.cachedState.expiresAt) {
      return this.cachedState.active;
    }

    const row = await this.db.query.agentState.findFirst({
      where: eq(agentState.key, 'kill_switch'),
    });

    const active = (row?.value as { active?: boolean })?.active === true;
    this.cachedState = { active, expiresAt: now + this.TTL_MS };
    return active;
  }

  /** Throws KillSwitchActiveError if kill switch is engaged */
  async assertActive(): Promise<void> {
    if (await this.isActive()) {
      throw new KillSwitchActiveError('Kill switch is active. No new operations allowed.');
    }
  }
}

export class KillSwitchActiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KillSwitchActiveError';
  }
}
```

### Pattern 5: Kill Switch CLI (KILL-01, audit log)

**What:** `jarvis kill <reason>` writes to `agent_state` and appends to `kill_switch_audit`. Uses `commander`.

```typescript
// packages/cli/src/commands/kill.ts
// Source: https://github.com/tj/commander.js (verified)

import { Command } from 'commander';
import { db } from '@jarvis/db';
import { activateKillSwitch } from '@jarvis/ai';

export const killCommand = new Command('kill')
  .argument('<reason>', 'Reason for activating the kill switch')
  .action(async (reason: string) => {
    await activateKillSwitch(db, reason);
    console.log(`Kill switch activated: ${reason}`);
    process.exit(0);
  });
```

### Pattern 6: Credit Balance Monitoring (COST-01, COST-02)

**What:** Polls `GET /api/v1/key` (not `/api/v1/credits` which requires a management key) on a timer. When `limit_remaining` drops below threshold, triggers graceful wind-down and sends Discord DM.

```typescript
// packages/ai/src/cost-monitor.ts
// Source: https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key (verified)

export class CreditMonitor {
  private readonly CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly LOW_CREDIT_THRESHOLD_USD = 5.00;   // Claude's discretion: $5 warning

  async checkBalance(): Promise<{ remaining: number | null; usage: number }> {
    const resp = await fetch('https://openrouter.ai/api/v1/key', {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    const data = await resp.json() as { data: KeyResponse };
    return {
      remaining: data.data.limit_remaining,
      usage: data.data.usage,
    };
  }
}
```

### Pattern 7: TOOL-06 — Kill Switch Gate on Tool Calls

**What:** Wrap `invokeWithLogging` from `@jarvis/tools` with a kill switch pre-check. The existing `invokeWithLogging` signature is not changed; a new `invokeWithKillCheck` wrapper is added.

```typescript
// packages/tools/src/invoke-safe.ts

export async function invokeWithKillCheck(
  guard: KillSwitchGuard,
  registry: ToolRegistry,
  db: DbClient,
  toolName: string,
  rawInput: unknown,
): Promise<ToolResult<unknown>> {
  // TOOL-06, KILL-03: Must check before invoking
  await guard.assertActive();
  return invokeWithLogging(registry, db, toolName, rawInput);
}
```

### Anti-Patterns to Avoid

- **Polling Postgres on every single AI call:** Use the 1-second in-memory cache in KillSwitchGuard. Without it, a planning loop making 50 AI calls per minute generates 50 DB reads per minute just for kill switch checks.
- **Using `/api/v1/credits` for balance monitoring:** This endpoint requires a Management API key, which is different from the regular API key used for completions. Use `/api/v1/key` instead — it returns `limit_remaining` and `usage` with the regular API key.
- **Storing model IDs in code constants:** Store them in config so they can be updated without a deploy. The `ModelTierConfig` object should be loaded from a JSON file or environment variables, validated with Zod on startup.
- **Calling OpenRouter directly from multiple places:** All AI calls must go through `ModelRouter`. Direct calls bypass kill switch checking and cost logging.
- **Catching `KillSwitchActiveError` silently:** This error must propagate up to halt the planning cycle. Only the BullMQ job handler should catch it (to fail the job gracefully without crashing the worker).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP client to OpenRouter | Custom fetch wrapper | `openai` npm SDK | Handles retries, streaming, SSE parsing, auth headers, type safety |
| Discord bot message sending | Raw Discord REST API | `discord.js` | Handles gateway, token auth, rate limits, channel/DM resolution |
| CLI argument parsing | Manual `process.argv` parsing | `commander` | Required args, help text, error messages, subcommand routing |
| Retry with backoff on AI failure | Custom retry loop | Handled at provider level OR simple p-retry | Edge cases: backoff jitter, max retries, non-retryable error codes |
| Cost calculation from token counts | Lookup table of model prices | Read `cost` from OpenRouter response | OpenRouter already computes it; local price tables go stale as models update |

**Key insight:** OpenRouter handles provider-level fallback, load balancing, and cost calculation. The agent should treat OpenRouter as a black box for those concerns and only implement what's above OpenRouter's abstraction layer (tier routing, kill switch, cost logging).

---

## Common Pitfalls

### Pitfall 1: `cost` Field Not Available in Standard OpenAI SDK Types

**What goes wrong:** The `usage` object in OpenAI SDK TypeScript types does not include a `cost` field. Accessing `response.usage.cost` gives a TypeScript error.

**Why it happens:** The `openai` SDK types mirror OpenAI's API spec, not OpenRouter's extended spec. OpenRouter adds `cost` as an extra field.

**How to avoid:** Cast `usage` to an extended type or use `(usage as unknown as { cost?: number }).cost ?? 0`. Alternatively, check the raw response body using `response.toJSON()` or access the raw response via the SDK's `_request` internals.

**Warning signs:** TypeScript error `Property 'cost' does not exist on type 'CompletionUsage'`.

### Pitfall 2: `/api/v1/credits` Requires Management Key, Not Regular API Key

**What goes wrong:** Calling `GET /api/v1/credits` with the regular inference API key returns 403 Forbidden.

**Why it happens:** OpenRouter has two distinct key types. The credits endpoint requires a Management API key (administrative-only). The inference API key (used for completions) cannot access it.

**How to avoid:** Use `GET /api/v1/key` with the regular API key — it returns `limit_remaining`, `usage`, `usage_daily`, `usage_monthly`, and `limit`. Source: https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key

**Warning signs:** 403 response from `/api/v1/credits` despite having a valid API key.

### Pitfall 3: Kill Switch Cached State Is Stale After Activation

**What goes wrong:** Operator runs `jarvis kill` but the agent continues for up to TTL_MS more before noticing.

**Why it happens:** In-memory cache has a TTL; the flag update is not pushed to the process.

**How to avoid:** Keep TTL at 1 second or lower. Document that kill switch takes effect within 1 second of activation (not immediately). If immediate halting is needed, the process can be SIGKILLed. The DB-backed state means after restart, the kill switch is still active.

**Warning signs:** Agent processes new work for several seconds after `jarvis kill` is issued.

### Pitfall 4: `discord.js` DM Fails Without `Partials.Channel`

**What goes wrong:** Bot cannot send DMs to users; `MessageCreate` events from DMs are never received.

**Why it happens:** discord.js v14 requires `Partials.Channel` to handle DM channels. Without it, DM channel objects are not cached and DM sends fail silently or throw.

**How to avoid:**
```typescript
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel],  // Required for DM support
});
```

**Warning signs:** `DiscordAPIError: Unknown Channel` when attempting to send DM to a user.

### Pitfall 5: Model ID Drift — Configured IDs Become Invalid

**What goes wrong:** A model ID like `anthropic/claude-sonnet-4.5` is correct today but OpenRouter deprecates it in favor of `anthropic/claude-4.5-sonnet-20250929`. Calls start failing with 404.

**Why it happens:** OpenRouter uses versioned slugs alongside convenience slugs. Convenience slugs (`claude-sonnet-4.5`) are more stable but not guaranteed to persist.

**How to avoid:** Store model IDs in config (not compiled constants). When OpenRouter returns a 404 for a model, log the error with the model ID to make it easy to identify which config entry to update. Prefer versioned slugs for stability.

**Warning signs:** HTTP 404 or "model not found" errors from OpenRouter.

### Pitfall 6: P&L View Not Queryable by Agent Without Explicit Grant

**What goes wrong:** Agent tries to query the P&L view via the db tool (TOOL-04) but gets permission denied.

**Why it happens:** The db tool connects as the application DB user. If the view is created under a different schema or with different permissions, the application user may not be able to read it.

**How to avoid:** Create the view in the `public` schema using the same migration pipeline. Verify the app DB user has `SELECT` on all tables and views referenced by the P&L computation.

**Warning signs:** `permission denied for view pnl_summary` in db tool output.

---

## Code Examples

Verified patterns from official sources:

### OpenRouter Completion Call (OpenAI SDK)

```typescript
// Source: https://openrouter.ai/docs/quickstart (verified 2026-02-18)
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'https://jarvis.internal',  // Appears on OpenRouter leaderboard
    'X-Title': 'Jarvis Agent',
  },
});

const response = await client.chat.completions.create({
  model: 'anthropic/claude-opus-4.6',
  messages: [{ role: 'user', content: 'Hello' }],
  stream: false,
});

// usage is always present in OpenRouter responses
const { prompt_tokens, completion_tokens, total_tokens } = response.usage!;
// cost is a non-standard OpenRouter extension to the usage object
const costUsd = (response.usage as unknown as { cost?: number }).cost ?? 0;
```

### Credit Balance Check (Regular API Key)

```typescript
// Source: https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key (verified 2026-02-18)
// Note: Use GET /api/v1/key with regular API key, NOT /api/v1/credits (requires management key)

interface KeyData {
  label: string;
  usage: number;
  usage_daily: number;
  usage_monthly: number;
  limit: number | null;
  limit_remaining: number | null;
  is_free_tier: boolean;
  rate_limit: { requests: number; interval: string };
}

const resp = await fetch('https://openrouter.ai/api/v1/key', {
  headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
});
const { data } = (await resp.json()) as { data: KeyData };

const remainingUsd = data.limit_remaining;  // null = unlimited
const usedUsd = data.usage;
```

### Kill Switch DB Schema

```typescript
// New table: packages/db/src/schema/kill-switch-audit.ts
import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const killSwitchAudit = pgTable('kill_switch_audit', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  action: text('action').notNull(),       // 'activate' | 'deactivate'
  reason: text('reason').notNull(),
  triggeredBy: text('triggered_by').notNull(),  // 'cli' | 'api' | 'agent'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Kill switch live state stored in existing agent_state table:
// key = 'kill_switch', value = { active: boolean, reason: string, activatedAt: string }
// This table already exists from Phase 1 — no new table needed for the live flag.
```

### AI Calls Schema (MODL-02, COST-01)

```typescript
// New table: packages/db/src/schema/ai-calls.ts
import { integer, numeric, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

export const aiCalls = pgTable('ai_calls', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  model: varchar('model', { length: 128 }).notNull(),      // exact model ID from response
  tier: varchar('tier', { length: 32 }).notNull(),          // 'strong' | 'mid' | 'cheap'
  promptTokens: integer('prompt_tokens').notNull(),
  completionTokens: integer('completion_tokens').notNull(),
  costUsd: numeric('cost_usd', { precision: 12, scale: 8 }).notNull(),
  goalId: integer('goal_id'),                                // optional link to planning cycle
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

### Operating Costs + Revenue Schema (COST-02, COST-03)

```typescript
// New table: packages/db/src/schema/operating-costs.ts
import { integer, numeric, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const costCategoryEnum = pgEnum('cost_category', ['ai_inference', 'vm', 'api_service', 'other']);

export const operatingCosts = pgTable('operating_costs', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  category: costCategoryEnum('category').notNull(),
  amountUsd: numeric('amount_usd', { precision: 12, scale: 8 }).notNull(),
  description: text('description'),
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// New table: packages/db/src/schema/revenue.ts
export const revenue = pgTable('revenue', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  strategyId: text('strategy_id').notNull(),
  sourceAttribution: text('source_attribution'),
  amountUsd: numeric('amount_usd', { precision: 12, scale: 8 }).notNull(),
  earnedAt: timestamp('earned_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

### Commander CLI Entry Point

```typescript
// Source: https://github.com/tj/commander.js (verified 2026-02-18)
import { Command } from 'commander';

const program = new Command();

program
  .name('jarvis')
  .description('Jarvis agent control CLI')
  .version('0.1.0');

program
  .command('kill')
  .argument('<reason>', 'Reason for activating kill switch')
  .description('Activate the kill switch — halts all new agent operations')
  .action(async (reason: string) => {
    // Write to agent_state: { key: 'kill_switch', value: { active: true, reason } }
    // Append to kill_switch_audit: { action: 'activate', reason, triggeredBy: 'cli' }
    console.log(`Kill switch activated. Reason: ${reason}`);
    process.exit(0);
  });

program
  .command('resume')
  .argument('<reason>', 'Reason for deactivating kill switch')
  .description('Deactivate the kill switch — allows agent operations to resume')
  .action(async (reason: string) => {
    // Write to agent_state: { key: 'kill_switch', value: { active: false, reason } }
    // Append to kill_switch_audit: { action: 'deactivate', reason, triggeredBy: 'cli' }
    console.log(`Kill switch deactivated. Reason: ${reason}`);
    process.exit(0);
  });

program.parseAsync(process.argv);
```

### Discord DM Notification

```typescript
// Source: https://discordjs.guide (verified 2026-02-18)
import { Client, GatewayIntentBits, Partials } from 'discord.js';

export async function sendOperatorDm(
  token: string,
  operatorUserId: string,
  message: string,
): Promise<void> {
  const client = new Client({
    intents: [GatewayIntentBits.DirectMessages],
    partials: [Partials.Channel],  // Required for DM support in discord.js v14
  });

  await client.login(token);

  // Wait for ready
  await new Promise<void>((resolve) => client.once('ready', () => resolve()));

  const user = await client.users.fetch(operatorUserId);
  await user.send(message);
  await client.destroy();
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-provider SDKs (openai, anthropic, etc.) | Single OpenAI-compatible SDK pointed at OpenRouter | 2023+ | One integration, 300+ models |
| Manual cost calculation from token counts | OpenRouter returns `cost` field directly in `usage` | 2024 | No need for local price tables |
| `usage: { include: true }` parameter | Usage always included automatically | Late 2024 | Parameter removed/deprecated |
| `stream_options: { include_usage: true }` | Usage included in last SSE chunk automatically | Late 2024 | Simpler streaming setup |
| discord.js `Partials.CHANNEL` (string) | `Partials.Channel` (enum import) | discord.js v14 (2022) | String form throws runtime error |
| `@types/commander` separate package | Types built into `commander` | commander v9+ | No separate `@types` install needed |

**Verified model IDs on OpenRouter (2026-02-18):**
- `anthropic/claude-opus-4.6` — confirmed available, $5/M input, $25/M output
- `anthropic/claude-sonnet-4.5` — confirmed available (permanent slug: `anthropic/claude-4.5-sonnet-20250929`), $3/M input, $15/M output
- `x-ai/grok-4.1-fast` — confirmed available, ~$0.20/M input, $0.50/M output

---

## Claude's Discretion Recommendations

### Routing Decision Algorithm
**Recommendation: explicit tier-per-call-site** — callers declare the tier needed ("strong" for planning, "cheap" for classification). No automatic complexity scoring in Phase 2. Rationale: complexity scoring requires heuristics that are hard to test and can silently route incorrectly. Explicit tier declaration is simple, predictable, and auditable.

### Fallback Behavior When Provider Fails
**Recommendation: let OpenRouter handle provider-level fallback natively** — send a `models` array in the request body (primary + one fallback of same tier). Application-level retry: single retry with 2-second delay on HTTP 5xx/429. Do NOT fall to a different tier on failure — this would silently change cost and capability characteristics.

```typescript
// OpenRouter model fallback — include in every completion request:
// Primary: anthropic/claude-opus-4.6, Fallback: anthropic/claude-4-opus-20250522
// Source: https://openrouter.ai/docs/guides/routing/model-fallbacks (verified)
const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  body: JSON.stringify({
    models: [primary, fallback],  // OpenRouter tries in order
    messages,
  }),
});
// OR via openai SDK: pass as extra_body
const response = await client.chat.completions.create({
  model: primary,
  messages,
  // @ts-expect-error extra_body is not in openai SDK types
  extra_body: { models: [primary, fallback] },
});
```

### Cost Tracking Granularity
**Recommendation: per-call granularity** (COST-01 schema inserts one row per completion) AND a daily roll-up into `operating_costs` for the P&L view. The agent reads P&L from the aggregated view, not from raw `ai_calls`, for performance.

### API Key Management
**Recommendation: environment variables** (not encrypted DB storage). The OpenRouter API key is a single secret; env vars are the standard for secrets in container deployments. DB storage adds complexity (encryption at rest, key rotation) without significant benefit at this stage.

```
OPENROUTER_API_KEY=sk-or-v1-...    # Inference key
DISCORD_BOT_TOKEN=...               # Discord bot token
DISCORD_OPERATOR_USER_ID=...        # Operator's Discord user ID
```

### Low-Credit Warning Threshold
**Recommendation: $5.00 USD remaining** — sends Discord DM and initiates graceful wind-down. At the typical agent burn rate (mix of strong/cheap calls), $5 provides roughly 15-30 minutes of operation, which is enough time for the operator to top up.

### Discord Bot Setup
**Recommendation: minimal bot setup** — create a Discord application with a bot token, invite it to the operator's private server, use `users.fetch(operatorUserId)` to DM directly. No slash commands needed in Phase 2. The bot only sends outbound DMs; it does not receive commands in Phase 2 (the CLI handles that).

---

## Open Questions

1. **Does the `openai` npm SDK's `extra_body` work cleanly for passing OpenRouter's `models` fallback array?**
   - What we know: OpenRouter docs say to use `extra_body` when the SDK doesn't natively support a field
   - What's unclear: Whether `extra_body` is typed or causes TypeScript errors
   - Recommendation: Use `// @ts-expect-error` or cast; the `openai` SDK accepts `extra_body` at runtime. Alternatively, make the fallback call via raw `fetch` and bypass the SDK for fallback scenarios.

2. **Is a separate `packages/cli` package the right home for the CLI binary, or should it live in `apps/agent`?**
   - What we know: The CLI needs DB access; `apps/agent` already depends on `@jarvis/db`
   - What's unclear: Whether the CLI needs to be installable as a separate binary or bundled with the agent
   - Recommendation: Create `apps/cli` (not `packages/cli`) since it's a deployable binary, not a shared library. It depends on `@jarvis/db` and `@jarvis/ai`.

3. **The `numeric` Drizzle type for cost storage — should it use `precision: 12, scale: 8` or just `real`?**
   - What we know: OpenRouter costs are in USD, typically in the range $0.000001–$0.01 per call
   - What's unclear: Whether floating-point precision issues matter for audit summing
   - Recommendation: Use `numeric(12, 8)` — financial values should use exact decimal types, not floating-point. Drizzle returns these as strings from Postgres; parse to `number` for computation or use a decimal library.

---

## Sources

### Primary (HIGH confidence)
- `https://openrouter.ai/docs/quickstart` — TypeScript usage pattern, openai SDK with OpenRouter
- `https://openrouter.ai/docs/api/api-reference/credits/get-credits` — credits endpoint (management key required)
- `https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key` — `/api/v1/key` endpoint schema (regular API key, returns `limit_remaining`)
- `https://openrouter.ai/docs/guides/guides/usage-accounting` — `usage.cost` field in every response
- `https://openrouter.ai/docs/guides/routing/model-fallbacks` — `models` array fallback pattern
- `https://openrouter.ai/anthropic/claude-opus-4.6` — verified model ID and pricing
- `https://openrouter.ai/anthropic/claude-sonnet-4.5` — verified model ID and pricing
- `https://openrouter.ai/x-ai/grok-4.1-fast` — verified model ID and pricing
- `https://openrouter.ai/docs/api/reference/limits` — rate limits, `/api/v1/key` endpoint format
- `https://discordjs.guide` — discord.js v14 DM pattern, `Partials.Channel` requirement
- `https://github.com/tj/commander.js` — Commander CLI subcommand pattern
- Existing codebase — `agent_state` table schema, `invokeWithLogging` signature, `ToolRegistry` pattern

### Secondary (MEDIUM confidence)
- `https://openrouter.ai/docs/api/reference/overview` — endpoint overview
- `https://www.npmjs.com/package/@openrouter/ai-sdk-provider` — v2.2.3 (alternative, not chosen)
- Search results verifying `anthropic/claude-sonnet-4.5` slug from multiple sources

### Tertiary (LOW confidence)
- Discord.js DM `Partials.Channel` requirement — verified via official guide but not tested against current v14 version in this project

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `openai` SDK with OpenRouter verified in official quickstart; `discord.js` and `commander` are well-established
- Architecture: HIGH — provider interface pattern, KillSwitchGuard with cache, and kill switch via `agent_state` are all grounded in the existing Phase 1 patterns
- OpenRouter API (cost field, credits endpoint): HIGH — verified from official OpenRouter documentation
- Model IDs: HIGH — verified by fetching OpenRouter's Anthropic and xAI model pages directly
- Pitfalls: HIGH — `/api/v1/credits` vs `/api/v1/key` distinction confirmed by official docs; discord.js partials requirement confirmed by official guide
- Discord bot details: MEDIUM — DM sending pattern is straightforward but bot application setup is not tested

**Research date:** 2026-02-18
**Valid until:** 2026-03-18 (30 days — OpenRouter API is stable; model IDs may change if deprecated)
