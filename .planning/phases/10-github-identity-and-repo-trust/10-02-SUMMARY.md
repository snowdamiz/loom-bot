---
phase: 10-github-identity-and-repo-trust
plan: 02
subsystem: api
tags: [github-oauth, hono, pkce, setup-wizard, encrypted-credentials]
requires:
  - phase: 10-01
    provides: setup_state trust columns and oauth_state persistence table
provides:
  - authenticated OAuth start endpoint with hashed state + PKCE
  - public callback route with one-time state consumption and token exchange
  - encrypted GitHub token persistence + identity revalidation in setup state
affects: [phase-10-plan-03, setup-wizard, self-extension-trust-guard]
tech-stack:
  added: []
  patterns:
    - split authenticated-start and public-callback OAuth routing
    - fail-closed callback validation before token exchange
key-files:
  created:
    - apps/dashboard/src/routes/github-oauth-helpers.ts
    - apps/dashboard/src/routes/github-oauth-callback.ts
    - .planning/phases/10-github-identity-and-repo-trust/10-02-SUMMARY.md
  modified:
    - apps/dashboard/src/routes/setup.ts
    - apps/dashboard/src/app.ts
key-decisions:
  - "Mount callback under /setup/github/callback (outside /api middleware) so GitHub redirects are accepted without dashboard bearer token headers."
  - "Rotate prior active github oauth_token credential rows before inserting the newly exchanged token for consistent single-active-token semantics."
patterns-established:
  - "OAuth callback uses atomic consume-once state update to block replay."
  - "Setup API exposes backward-compatible fields plus optional trust metadata for frontend orchestration."
requirements-completed: [SEXT-01, SEXT-02, SEXT-03]
duration: 3 min
completed: 2026-02-19
---

# Phase 10 Plan 02: Real GitHub OAuth start/callback + encrypted token persistence Summary

**Real GitHub OAuth authorization code flow with PKCE/state validation, public callback exchange, and encrypted credential-backed token storage tied to verified identity metadata.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-19T22:42:00Z
- **Completed:** 2026-02-19T22:45:03Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Added `POST /api/setup/github/start` to generate PKCE/state, hash+persist state server-side, and return GitHub authorize URL.
- Added public callback route that validates one-time state, exchanges OAuth code, revalidates GitHub user identity, and updates setup state.
- Persisted OAuth token through encrypted `credentials` writes with active-token rotation and no plaintext token exposure in API responses.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement OAuth start endpoint with state and PKCE persistence** - `4bb0201` (feat)
2. **Task 2: Implement public callback exchange, identity revalidation, and encrypted token persistence** - `ee31b80` (feat)
3. **Task 3: Remove stub behavior and align setup state API with real OAuth status** - `f322283` (fix)

**Plan metadata:** pending (created after state/roadmap updates)

## Files Created/Modified
- `apps/dashboard/src/routes/setup.ts` - Added OAuth start endpoint and DB-backed setup status payload.
- `apps/dashboard/src/routes/github-oauth-helpers.ts` - Added PKCE/state helpers, OAuth exchange, identity fetch, and GitHub API utility helpers.
- `apps/dashboard/src/routes/github-oauth-callback.ts` - Added public callback implementation with anti-replay validation and encrypted token storage.
- `apps/dashboard/src/app.ts` - Mounted callback route outside `/api/*` bearer middleware.

## Decisions Made
- Keep callback route public and separate from authenticated `/api/*` routes to support GitHub redirects safely.
- Enforce single-active GitHub token credential semantics by rotating previous active `oauth_token` rows before insert.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Runtime curl validation for live endpoints was not executed in this workspace because database connection/environment bootstrap is not configured for an online dashboard run (`DATABASE_URL` missing).

## User Setup Required

None - no additional external-service setup document was required beyond existing env documentation.

## Next Phase Readiness
- OAuth identity connection path is now real and fail-closed.
- Ready for Plan 10-03 repository binding UX/API and builtin modification trust gating.

---
*Phase: 10-github-identity-and-repo-trust*
*Completed: 2026-02-19*
