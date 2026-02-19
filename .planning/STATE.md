# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-19)

**Core value:** The agent must be able to autonomously reason about opportunities, acquire the tools and accounts it needs, and execute money-making strategies without human intervention.
**Current focus:** v1.1 self-extension hardening — GitHub-backed self-modification safety

## Current Position

Phase: 10-github-identity-and-repo-trust
Plan: 03 (10-02 complete)
Status: Executing phase 10 plans with real GitHub trust onboarding
Last activity: 2026-02-19 - Completed 10-02 real OAuth start/callback flow

Progress: [████████████████░░░░░░░░░] 66% (phase 10 execution)

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
All v1.0 decisions reviewed and outcomes recorded at milestone completion.
- [Phase 10]: Store only githubTokenCredentialId in setup_state and keep GitHub OAuth token material in encrypted credentials records. — Maintains the existing secret-at-rest model and avoids plaintext token persistence in setup metadata.
- [Phase 10]: Persist hashed OAuth state with PKCE verifier lifecycle metadata. — Enables anti-forgery and anti-replay checks during callback while avoiding raw state token storage.
- [Phase 10]: Expose OAuth callback as /setup/github/callback outside /api bearer middleware. — GitHub redirects cannot carry dashboard bearer headers, so callback must be public while state/PKCE enforce safety.
- [Phase 10]: Rotate previously active github oauth_token credentials before storing newly exchanged token. — Preserves a deterministic single-active-token model and avoids stale token ambiguity during trust checks.

### Pending Todos

- Execute 10-03 repo binding UX/API and builtin modification trust guard.

### Blockers/Concerns

- Local `pnpm db:push` is currently blocked until `DATABASE_URL` is configured in this environment.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Ensure app follows login, setup wizard, dashboard with sidebar chat, and seed agent flow | 2026-02-19 | 84f838b | [1-ensure-app-follows-login-setup-wizard-da](./quick/1-ensure-app-follows-login-setup-wizard-da/) |
| 2 | Re-add browser tools (8 tools) to agent startup — BrowserManager lifecycle managed, 20 tools total | 2026-02-19 | 96ba883 | [2-re-add-browser-tools-to-agent-startup](./quick/2-re-add-browser-tools-to-agent-startup/) |
| 3 | Add comprehensive README.md (205 lines, 11 sections, all 20 tools and 15 env vars documented) | 2026-02-19 | 103f57a | [3-add-comprehensive-documentation-as-readm](./quick/3-add-comprehensive-documentation-as-readm/) |

## Session Continuity

Last session: 2026-02-19
Stopped at: Completed 10-02-PLAN.md
Resume file: .planning/phases/10-github-identity-and-repo-trust/10-03-PLAN.md
