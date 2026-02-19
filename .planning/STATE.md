# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-19)

**Core value:** The agent must be able to autonomously reason about opportunities, acquire the tools and accounts it needs, and execute money-making strategies without human intervention.
**Current focus:** v1.1 self-extension hardening — GitHub-backed self-modification safety

## Current Position

Phase: 11-version-controlled-self-modification-pipeline
Plan: In Progress (11-01 complete, 11-02 next)
Status: Phase 11 execution in progress; deterministic context and branch identity primitives landed
Last activity: 2026-02-19 - Completed 11-01 execution-context propagation and deterministic branch metadata helpers

Progress: [████████░░░░░░░░░░░░░░░░░] 33% (phase 11 execution)

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

### Pending Todos

- Execute 11-02 GitHub branch/commit/PR orchestration using deterministic context metadata.
- Execute 11-03 promotion gate and merge-blocking guardrails.
- Run Phase 11 verification after plans 02/03 complete.

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

## Session Continuity

Last session: 2026-02-19
Stopped at: Completed 11-01-PLAN.md
Resume file: None
