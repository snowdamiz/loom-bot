# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-19)

**Core value:** The agent must be able to autonomously reason about opportunities, acquire the tools and accounts it needs, and execute money-making strategies without human intervention.
**Current focus:** v1.1 self-extension hardening — GitHub-backed self-modification safety

## Current Position

Phase: 13-promotion-guardrails-rollback-and-visibility
Plan: verification completed
Status: Phase 13 execution and verification complete; milestone ready for completion workflow
Last activity: 2026-02-20 - Verified Phase 13 goal and marked phase complete

Progress: [████████████████████████] 100% (phase 13 execution + verification)

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
All v1.0 decisions reviewed and outcomes recorded at milestone completion.
- [Phase 10]: Store only githubTokenCredentialId in setup_state and keep GitHub OAuth token material in encrypted credentials records. — Maintains the existing secret-at-rest model and avoids plaintext token persistence in setup metadata.
- [Phase 10]: Persist hashed OAuth state with PKCE verifier lifecycle metadata. — Enables anti-forgery and anti-replay checks during callback while avoiding raw state token storage.
- [Phase 10]: Expose OAuth callback as /setup/github/callback outside /api bearer middleware. — GitHub redirects cannot carry dashboard bearer headers, so callback must be public while state/PKCE enforce safety.
- [Phase 10]: Rotate previously active github oauth_token credentials before storing newly exchanged token. — Preserves a deterministic single-active-token model and avoids stale token ambiguity during trust checks.
- [Phase 10]: Setup completion now requires repository trust binding in addition to OAuth identity connection. — SEXT-04 requires explicit trusted repository anchor before enabling self-modification paths.
- [Phase 10]: Centralize builtinModify preconditions in github-trust-guard before stageBuiltinChange. — Single fail-closed guard point prevents bypass drift and keeps trust enforcement deterministic.
- [Phase 11]: Execution context is internal metadata and must not change tool input schema validation behavior. — Keeps deterministic traceability plumbing separate from LLM-facing schemas and preserves backward compatibility for existing tool calls.
- [Phase 11]: Deterministic branch identity is derived from goal/cycle/sub-goal/tool context plus change fingerprint without timestamps. — Supports idempotent branch reuse and deterministic auditability for repository-backed self-modification.
- [Phase 11]: Sub-agent execution context identifiers are nullable when not available. — Worker jobs do not always carry full goal/cycle metadata; best-effort propagation avoids blocking execution while preserving available trace data.
- [Phase 11]: Trusted GitHub context resolution now includes decrypted OAuth token retrieval in tools package. — Self-extension pipeline must call GitHub APIs with fail-closed credentials sourced from validated setup trust state.
- [Phase 11]: Builtin modify flow now runs compile+sandbox checks before repository promotion operations. — Preserves safety ordering while still publishing candidate branch/PR/status evidence for auditability.
- [Phase 11]: Pull requests are upserted by deterministic branch identity instead of created per attempt. — Avoids PR spam and keeps retries attached to one auditable candidate lifecycle.
- [Phase 11]: Promotion gate defaults to required context jarvis/sandbox and blocks merge on missing/pending/failing states. — SEXT-08 requires fail-closed promotion behavior tied to repository status truth.
- [Phase 11]: Promotion merge uses expected head SHA guard and only cleans branch after successful merge. — Prevents stale-head merges and ensures short-lived branch artifacts are cleaned up only when promotion is truly complete.
- [Phase 11]: Builtin modify payload now exposes promotionBlocked, blockReasons, and mergeError diagnostics. — Operators and autonomous planning need deterministic machine-readable failure reasons to recover safely.
- [Phase 12]: Worktree lifecycle failures are encoded as typed WorktreeIsolationError metadata categories. — Verifier orchestration needs deterministic classification of setup/infra/cleanup failures for safe promotion gating and operator diagnostics.
- [Phase 12]: All isolation shell-outs use runBoundedCommand with timeout, kill escalation, and bounded output capture. — SEXT-10 requires deterministic runtime bounds and prevents verifier subprocesses from wedging the main agent loop.
- [Phase 12]: Verification diagnostics are normalized from bounded command telemetry into typed stage and run contracts. — SEXT-12 requires machine-readable failure data for downstream staging decisions and operator visibility.
- [Phase 12]: Verification policy now emits fixed required stages compile, targetedTests, and startupSmoke for every builtin candidate run. — SEXT-11 requires deterministic required-stage enforcement; unknown paths must fail closed instead of skipping checks.
- [Phase 12]: Isolated verifier hydrates required node_modules links into ephemeral worktrees before executing policy stages. — Ensures isolated stage commands can execute toolchain binaries without mutating the live checkout and prevents false failures from missing dependencies.
- [Phase 12]: stageBuiltinChange now returns before pipeline invocation whenever isolated verifier does not pass. — Promotion safety requires fail-closed behavior so repository branch/PR operations never run on unverified candidates.
- [Phase 12]: Agent startup smoke mode now validates core boot wiring and exits deterministically with explicit resource teardown. — SEXT-11 requires bounded startup checks that do not enter long-running supervisor behavior.
- [Phase 12]: Isolated verifier startup stage now executes @jarvis/agent startup:smoke and captures startup-specific stage diagnostics. — Startup smoke must be a required verification stage with actionable diagnostics for SEXT-11 and SEXT-12.
- [Phase 12]: Builtin modify responses now expose verificationOverallStatus, verificationFailedStage, verificationFailureCategory, and verificationDiagnostics. — Operators and autonomous reasoning need machine-readable failure context without parsing raw logs.
- [Phase 13]: Lifecycle audit events now flow through a typed append helper that records run/stage/context metadata in self_extension_events. — SEXT-14 requires durable append-only lifecycle truth that remains machine-readable for operators and downstream automation.
- [Phase 13]: Promotion pause state is persisted under self_extension:promotion_control and evaluated independently from kill_switch. — SEXT-16 requires an operator promotion guard that does not halt the broader agent runtime.
- [Phase 13]: Builtin promotion checks pause state both before GitHub mutations and immediately before merge. — A double guard closes pause-race windows and keeps promotion fail-closed even when an operator toggles pause during an in-flight run.
- [Phase 13]: Promotion now writes promoted_pending_health state and blocks new promotions while pending-health or rollback-failed states remain unresolved. — Keeps promotion fail-closed until runtime health is confirmed or rollback state is cleared.
- [Phase 13]: Supervisor loop heartbeats are persisted under system:loop_health and used by health-window evaluation logic. — Provides deterministic health signals across process restarts for SEXT-13 rollback triggering.
- [Phase 13]: Automated rollback runs through deterministic GitHub rollback branch/PR/merge flow with cooldown/idempotency guards. — Prevents duplicate rollback thrash while restoring known-good baselines.
- [Phase 13]: Dashboard now exposes a dedicated /api/self-extension snapshot contract for pipeline, baseline, rollback, and promotion pause state. — Gives operators and autonomous logic a stable machine-readable source for self-extension health.
- [Phase 13]: Promotion pause/resume controls append promotion_pause_changed audit events before broadcasting SSE updates. — Maintains append-only lifecycle traceability for operator control actions.
- [Phase 13]: Overview UI includes a SelfExtensionCard with explicit pause/resume flow and non-silent API error handling. — SEXT-15/16 require operator-visible pipeline control independent from kill switch.

### Pending Todos

- Complete v1.1 milestone archival/transition workflow.

### Blockers/Concerns

- Local `pnpm db:push` is currently blocked until `DATABASE_URL` is configured in this environment.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Ensure app follows login, setup wizard, dashboard with sidebar chat, and seed agent flow | 2026-02-19 | 84f838b | [1-ensure-app-follows-login-setup-wizard-da](./quick/1-ensure-app-follows-login-setup-wizard-da/) |
| 2 | Re-add browser tools (8 tools) to agent startup — BrowserManager lifecycle managed, 20 tools total | 2026-02-19 | 96ba883 | [2-re-add-browser-tools-to-agent-startup](./quick/2-re-add-browser-tools-to-agent-startup/) |
| 3 | Add comprehensive README.md (205 lines, 11 sections, all 20 tools and 15 env vars documented) | 2026-02-19 | 103f57a | [3-add-comprehensive-documentation-as-readm](./quick/3-add-comprehensive-documentation-as-readm/) |

### Performance Metrics

| Phase | Plan | Duration | Tasks | Files |
|---|---|---|---|---|
| 11 | 01 | 4 min | 3 | 8 |
| 11 | 02 | 3 min | 3 | 5 |
| 11 | 03 | 2 min | 3 | 6 |
| 12 | 01 | 3 min | 3 | 4 |
| 12 | 02 | 4 min | 3 | 4 |
| 12 | 03 | 9 min | 3 | 6 |
| 13 | 01 | 3 min | 3 | 8 |
| 13 | 02 | 6 min | 3 | 10 |
| 13 | 03 | 3 min | 3 | 12 |

## Session Continuity

Last session: 2026-02-20
Stopped at: Completed 13-VERIFICATION.md and phase completion updates
Resume file: .planning/phases/13-promotion-guardrails-rollback-and-visibility/13-VERIFICATION.md
