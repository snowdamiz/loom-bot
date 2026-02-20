# Phase 13: Promotion Guardrails, Rollback, and Visibility - Research

**Researched:** 2026-02-20
**Domain:** Self-extension promotion recovery, append-only lifecycle audit, and operator-visible pipeline controls
**Confidence:** HIGH-MEDIUM (strong confidence in current codebase integration points; medium confidence on exact rollback health thresholds pending product decision)

<user_constraints>
## User Constraints (from CONTEXT.md)

No `13-CONTEXT.md` exists yet, so this research uses roadmap + requirements + current Phase 10-12 implementation.

Planning assumptions used for this phase:
- Keep the current trusted GitHub self-extension flow (`tool_write` -> `stageBuiltinChange` -> `runGitHubSelfExtensionPipeline`) and extend it with rollback and visibility controls.
- Keep fail-closed verification ordering introduced in Phase 12.
- Use existing stack and patterns first: Drizzle schemas, `agent_state`, Hono routes, SSE broadcaster/poller, and typed tool responses.
- Keep promotion pause independent from global kill switch so operator can halt code promotion without stopping the agent loop.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SEXT-13 | Keep known-good reference and automate rollback on degraded startup/loop health | Persist known-good baseline metadata, gate baseline advancement on post-promotion health window, and add deterministic rollback execution that restores previous-good revision for changed built-in files. |
| SEXT-14 | Append-only audit events for every self-modification lifecycle stage | Add `self_extension_events` insert-only ledger with deterministic stage taxonomy (`proposed`, `tested`, `promoted`, `promotion_blocked`, `rollback_started`, `rolled_back`, `failed`, `pause_toggled`). |
| SEXT-15 | Dashboard/API exposure of pipeline state and latest PR/test outcome | Add API + SSE payload contract backed by latest event plus current snapshot state (`lastRun`, `lastPR`, `lastVerification`, `lastRollback`, `promotionPaused`). |
| SEXT-16 | Operator can pause promotion independently from kill switch | Add dedicated promotion control state (`self_extension:promotion_control`) checked before GitHub promotion path; expose dashboard toggle route and audit event. |
</phase_requirements>

---

## Summary

Phase 12 already gives strong pre-promotion safety: isolated worktree verification, bounded command execution, required stage enforcement, and structured diagnostics. Promotion is blocked fail-closed when required statuses are missing/failing. What is still missing for Phase 13 is persistence and operability: there is no durable known-good baseline pointer, no append-only lifecycle ledger for self-extension stages, no operator-facing pipeline status endpoint, and no dedicated promotion pause switch.

The existing architecture is well-positioned for this phase. Self-extension execution already centralizes through `stageBuiltinChange` and `runGitHubSelfExtensionPipeline`, which is the right insertion point for lifecycle event emission, promotion pause gating, and baseline lifecycle updates. Dashboard already has authenticated Hono routes, SSE infrastructure, and status/activity polling patterns that can be extended without introducing new framework dependencies.

**Primary recommendation:** Implement a two-layer model: (1) append-only `self_extension_events` for audit truth, and (2) `agent_state` snapshot keys for fast reads (`known_good_baseline`, `promotion_control`, `pipeline_status`) consumed by dashboard/API and rollback logic.

---

## Standard Stack

### Core

| Library/Capability | Version | Purpose | Why Standard |
|--------------------|---------|---------|--------------|
| Existing self-extension pipeline modules (`staging-deployer.ts`, `github-pipeline.ts`) | in-repo | Single control plane for propose/test/promote lifecycle | Centralized, already trusted path for builtin modifications |
| Drizzle schema + Postgres tables | drizzle-orm `0.40.x` | Add append-only lifecycle event table and optional rollback metadata table | Matches current data layer and existing audit-table patterns |
| `agent_state` JSONB snapshots | in-repo | Fast current-state reads for dashboard/poller and gate checks | Already used for kill switch/system status and supports low-friction state extensions |
| Hono API routes + zod validators | hono `4.7.x`, zod `3.25.x` | Expose pipeline status and promotion pause endpoints | Existing dashboard backend pattern; minimal new surface area |
| SSE broadcaster/poller | in-repo | Push live self-extension state changes to dashboard | Existing real-time mechanism for status/activity updates |

### Supporting

| Library/Capability | Version | Purpose | When to Use |
|--------------------|---------|---------|-------------|
| GitHub REST commit status + PR merge APIs (already used) | GitHub REST v2022-11-28 | Continue status-gated promotion and rollback execution in same model | For deterministic integration with existing branch/PR pipeline |
| Existing startup smoke command (`@jarvis/agent` `startup:smoke`) | in-repo | Post-promotion health confirmation input for baseline advancement/rollback trigger | Use in bounded post-promotion health window |
| Existing append-only table pattern (`tool_calls` parent row model) | in-repo pattern | Design reference for immutable lifecycle audit semantics | Use to avoid mutable status histories |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Baseline restore by file content at known-good ref | GitHub `revert` commit strategy | `revert` is elegant for pure commit workflows, but this pipeline updates file content via contents API and deterministic branches; explicit restore is more deterministic here |
| Event table + snapshot keys | Snapshot-only mutable state | Simpler writes, but loses append-only compliance and forensic history |
| Independent promotion pause control | Reuse global kill switch | Easier wiring, but violates SEXT-16 and blocks all agent activity, not just promotion |

**Installation:** none required for base implementation; use existing monorepo dependencies.

---

## Architecture Patterns

### Recommended Project Structure

```text
packages/db/src/schema/
├── self-extension-events.ts      # Append-only lifecycle ledger
└── self-extension-rollbacks.ts   # (optional) rollback attempt index

packages/tools/src/self-extension/
├── promotion-control.ts          # Read/check promotion pause state
├── lifecycle-events.ts           # Typed event emitter helpers
├── rollback-controller.ts        # Known-good restore orchestration
├── github-pipeline.ts            # Emits events + baseline transition hooks
└── staging-deployer.ts           # Gate + enrich tool response with event ids

apps/dashboard/src/routes/
├── self-extension.ts             # GET status, POST pause/resume promotion
└── status.ts                     # Optional summary stitch-in

apps/dashboard/src/
├── poller.ts                     # Emit self-extension payload to SSE
└── broadcaster.ts                # Existing event bus reuse

apps/dashboard/client/src/
├── hooks/useSelfExtensionStatus.ts
└── components/SelfExtensionCard.tsx
```

### Pattern 1: Known-Good Baseline Lifecycle (SEXT-13)

**What:** track a durable known-good baseline pointer and promote it only after post-promotion health checks pass.

**Flow:**
1. Before promotion merge, record `previousBaseline` and candidate metadata.
2. On merge success, mark candidate as `promoted_pending_health`.
3. Run bounded health confirmation window (startup smoke + loop heartbeat freshness).
4. If healthy: advance `known_good_baseline`.
5. If unhealthy: trigger automated rollback to previous baseline.

**Why:** prevents baseline drift and avoids treating freshly merged code as known-good before runtime behavior is confirmed.

### Pattern 2: Automated Rollback Controller (SEXT-13)

**What:** deterministic rollback orchestration from persisted baseline metadata.

**When to trigger:**
- Post-promotion health window fails.
- Startup/loop health signal degrades within configured rollback window.

**Execution shape:**
- Emit `rollback_started`.
- Restore previous-known-good content for changed built-in paths.
- Route through the same branch/PR/status gate primitives (or a tightly scoped rollback fast-path with explicit audit record).
- Emit `rolled_back` or `failed`.

### Pattern 3: Append-Only Lifecycle Event Ledger (SEXT-14)

**What:** immutable event rows for every self-extension lifecycle stage.

**Minimum event types:**
- `proposed`
- `tested`
- `promotion_blocked`
- `promoted`
- `rollback_started`
- `rolled_back`
- `failed`
- `promotion_pause_changed`

**Payload guidance:**
- `runId`, `goalId/cycleId/subGoalId`, `toolName`, `filePath`
- PR/branch/head metadata
- verification summary and failure category
- rollback target baseline + outcome

### Pattern 4: Snapshot + Stream Visibility Contract (SEXT-15)

**What:** maintain current state snapshots for fast API reads and stream deltas over SSE.

**API contract (example):**
- `GET /api/self-extension`:
  - `promotionPaused`
  - `lastEvent`
  - `lastPromotion` (PR URL, SHA, status, timestamp)
  - `lastVerification` (overall status, failed stage/category)
  - `lastRollback` (status, target baseline, timestamp)

**SSE:** emit `self_extension` updates whenever lifecycle events or promotion control state changes.

### Pattern 5: Independent Promotion Pause Guard (SEXT-16)

**What:** dedicated pause state checked before entering GitHub promotion operations.

**Guard semantics:**
- If paused, return fail-closed response:
  - `promotionAttempted: false`
  - `promotionBlocked: true`
  - `blockReasons: ['promotion-paused']`
- Emit append-only `promotion_pause_changed` on toggle and `promotion_blocked` on attempted promotion while paused.

### Anti-Patterns to Avoid

- Advancing known-good baseline immediately on merge success without runtime health confirmation.
- Storing lifecycle state only in mutable rows (destroys audit trail).
- Coupling promotion pause to global kill switch.
- Triggering rollback from unbounded background logic with no timeout/guardrails.
- Returning dashboard state by scraping PR text instead of persisted structured records.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Lifecycle audit history | Ad hoc log parsing | Dedicated append-only table | Queryable, deterministic, survives restarts |
| Promotion pause persistence | In-memory flag | `agent_state` persisted control key | Survives process restarts and supports dashboard control |
| Rollback detection | Manual operator interpretation of raw logs | Structured health gate + rollback trigger state | Deterministic trigger semantics, less operator guesswork |
| Dashboard visibility | Client-side inference from mixed endpoints | Explicit `/api/self-extension` contract + SSE event | Cleaner API and stable frontend integration |
| Schema inclusion | Creating schema files without config updates | Update `packages/db/src/schema/index.ts` and `packages/db/drizzle.config.ts` together | Avoids silent `db:push` drift for new tables |

**Key insight:** Phase 13 is an operational-control phase. The core gap is not code mutation mechanics; it is durable state modeling, lifecycle traceability, and controlled recovery behavior.

---

## Common Pitfalls

### Pitfall 1: Baseline advanced too early
**What goes wrong:** merged candidate is marked known-good before proving startup/loop health.  
**Why it happens:** merge success treated as final signal.  
**How to avoid:** use `promoted_pending_health` intermediate state and only advance baseline on explicit health pass.  
**Warning signs:** rollback points to already-broken revision.

### Pitfall 2: Rollback loops
**What goes wrong:** repeated rollback attempts oscillate between bad states.  
**Why it happens:** missing idempotency guard or same target repeatedly retried without backoff.  
**How to avoid:** persist rollback attempt correlation id, last attempted target, max-attempt policy, and cooldown window.  
**Warning signs:** multiple rollback events against identical baseline in short window.

### Pitfall 3: Pause race with in-flight promotions
**What goes wrong:** operator pauses promotion but one in-flight run still merges.  
**Why it happens:** pause checked only at run start, not before merge call.  
**How to avoid:** check pause state at least twice: before promotion pipeline start and immediately before merge attempt.  
**Warning signs:** `promotion_pause_changed` event precedes a later `promoted` event for the same window.

### Pitfall 4: Event payload bloat
**What goes wrong:** lifecycle table grows quickly and API responses become heavy.  
**Why it happens:** storing full diagnostics blobs on every stage event.  
**How to avoid:** store compact summaries in event row; keep full diagnostics in dedicated detail records or bounded JSON fields.  
**Warning signs:** large row sizes, slow activity queries.

### Pitfall 5: Health signals too weak for SEXT-13
**What goes wrong:** post-promotion degradation not detected.  
**Why it happens:** only checking startup smoke at promotion time; no loop heartbeat freshness criteria.  
**How to avoid:** add explicit loop heartbeat (`agent_state`) and stale-threshold checks during rollback window.  
**Warning signs:** agent appears “running” but no loop progress while promotions continue.

---

## Code Examples

Verified patterns aligned with current code style and architecture:

### Promotion pause guard
```typescript
const pause = await readPromotionControl(db);
if (pause.paused) {
  await appendSelfExtensionEvent(db, {
    runId,
    type: 'promotion_blocked',
    payload: { reason: 'promotion-paused', pausedBy: pause.updatedBy },
  });
  return {
    success: false,
    promotionAttempted: false,
    promotionSucceeded: false,
    promotionBlocked: true,
    blockReasons: ['promotion-paused'],
  };
}
```

### Append-only lifecycle event insert
```typescript
await db.insert(selfExtensionEvents).values({
  runId,
  eventType: 'promoted',
  actorSource: executionContext.actorSource ?? 'tool-write',
  payload: {
    branchName,
    pullRequestNumber,
    headSha,
    verificationOverallStatus,
  },
});
```

### Known-good baseline transition
```typescript
// 1) write pending health state on merge success
await upsertAgentState(db, 'self_extension:pipeline_status', {
  status: 'promoted_pending_health',
  promotedSha: headSha,
  previousBaselineSha,
  healthDeadlineAt: new Date(Date.now() + 5 * 60_000).toISOString(),
});

// 2) health watcher advances baseline or triggers rollback
if (healthPassed) {
  await upsertAgentState(db, 'self_extension:known_good_baseline', {
    sha: headSha,
    confirmedAt: new Date().toISOString(),
  });
} else {
  await triggerRollbackToBaseline(previousBaselineSha);
}
```

---

## State of the Art

| Old Approach (current Phase 12 baseline) | Current Approach for Phase 13 | When Changed | Impact |
|------------------------------------------|-------------------------------|--------------|--------|
| Promotion outcomes mostly returned to `tool_write` caller | Persisted lifecycle events + snapshot status API | Phase 13 | Durable operator/audit visibility |
| Merge gate depends mainly on status contexts (`jarvis/sandbox`) | Merge gate + independent promotion pause + health-confirmed baseline transition | Phase 13 | Safer promotion control without halting all operations |
| No automated known-good rollback path | Deterministic rollback controller targeting persisted baseline | Phase 13 | Recoverability from bad promotions |
| Status dashboard focused on kill switch/system/activity | Dedicated self-extension pipeline status and SSE updates | Phase 13 | Faster operator triage and autonomous reasoning inputs |

**Deprecated/outdated for this milestone:**
- Treating successful merge as equivalent to known-good runtime health.
- Relying on ad hoc logs and tool response payloads as the only audit surface.

---

## Open Questions

1. **What should define loop-health degradation for automatic rollback?**
   - What we know: startup smoke is available; loop heartbeat freshness is not explicitly modeled yet.
   - What is unclear: exact threshold (for example, stale for N minutes, zero tool calls for M minutes, or goal-cycle failure counts).
   - Recommendation: define explicit rollback SLO thresholds in Plan 01 and encode as deterministic policy constants.

2. **Should rollback re-use full PR/status promotion flow or use a rollback fast-path?**
   - What we know: existing PR flow is robust and audited.
   - What is unclear: whether rollback needs immediate direct restoration for severe outages.
   - Recommendation: default to same PR/status flow for consistency; add optional emergency fast-path only with explicit safeguards and event labels.

3. **How much diagnostics should be stored in lifecycle events vs. referenced externally?**
   - What we know: `verificationDiagnostics` can be large.
   - What is unclear: desired retention and query performance targets.
   - Recommendation: store compact summary + IDs in event rows; keep full diagnostics bounded or in detail table.

4. **Operator UX for pause semantics**
   - What we know: kill switch UX already exists.
   - What is unclear: whether pause should block only merge, or also branch/PR creation.
   - Recommendation: pause should block promotion actions (at minimum merge, preferably full GitHub promotion path) while still allowing non-self-extension agent work.

---

## Sources

### Primary (HIGH confidence)

- Internal implementation and current behavior:
  - `/Users/sn0w/Documents/dev/jarvis/packages/tools/src/self-extension/staging-deployer.ts`
  - `/Users/sn0w/Documents/dev/jarvis/packages/tools/src/self-extension/github-pipeline.ts`
  - `/Users/sn0w/Documents/dev/jarvis/packages/tools/src/self-extension/promotion-gate.ts`
  - `/Users/sn0w/Documents/dev/jarvis/packages/tools/src/self-extension/isolated-verifier.ts`
  - `/Users/sn0w/Documents/dev/jarvis/packages/tools/src/self-extension/verification-policy.ts`
  - `/Users/sn0w/Documents/dev/jarvis/packages/tools/src/self-extension/verification-diagnostics.ts`
  - `/Users/sn0w/Documents/dev/jarvis/packages/tools/src/self-extension/workspace-isolation.ts`
  - `/Users/sn0w/Documents/dev/jarvis/packages/tools/src/self-extension/tool-writer.ts`
  - `/Users/sn0w/Documents/dev/jarvis/apps/dashboard/src/routes/status.ts`
  - `/Users/sn0w/Documents/dev/jarvis/apps/dashboard/src/routes/activity.ts`
  - `/Users/sn0w/Documents/dev/jarvis/apps/dashboard/src/poller.ts`
  - `/Users/sn0w/Documents/dev/jarvis/packages/ai/src/kill-switch.ts`
  - `/Users/sn0w/Documents/dev/jarvis/packages/db/src/schema/tool-calls.ts`
  - `/Users/sn0w/Documents/dev/jarvis/.planning/ROADMAP.md`
  - `/Users/sn0w/Documents/dev/jarvis/.planning/REQUIREMENTS.md`

### Secondary (MEDIUM confidence)

- GitHub REST docs:
  - https://docs.github.com/en/rest/commits/statuses
  - https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request
  - https://docs.github.com/en/rest/repos/contents
- PostgreSQL docs:
  - https://www.postgresql.org/docs/current/datatype-json.html

### Tertiary (LOW confidence)

- None.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - grounded in existing modules and package dependencies.
- Architecture patterns: HIGH-MEDIUM - integration points are clear; health/rollback thresholds require one product decision pass.
- Pitfalls: MEDIUM - based on current architecture and typical failure modes for autonomous promotion systems.

**Research date:** 2026-02-20
**Valid until:** 2026-03-22 (revalidate if promotion flow contract or dashboard route architecture changes)
