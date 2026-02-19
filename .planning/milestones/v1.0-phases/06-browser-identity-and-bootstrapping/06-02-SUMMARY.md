---
phase: 06-browser-identity-and-bootstrapping
plan: 02
subsystem: identity, security
tags: [pgcrypto, aes256, faker, identity, credentials, audit, guerrilla-mail, discord, encryption]

# Dependency graph
requires:
  - phase: 06-01
    provides: identities/credentials/credential_access_audit tables with pgcrypto bytea columns
  - phase: 01-infrastructure
    provides: "@jarvis/db package, sql tagged template, DbClient type"

provides:
  - storeCredential + retrieveCredential functions with pgcrypto AES-256 encrypt/decrypt
  - listCredentials: metadata-only listing without decryption
  - rotateCredential: mark old 'rotated', insert new active row
  - credential_store ToolDefinition: agent-accessible encrypted credential storage
  - credential_retrieve ToolDefinition: agent-accessible decryption with audit logging
  - identity_create ToolDefinition: faker persona (name, email, address, DOB, bio, job), inserts to DB, stores master_password in vault
  - temp_email_create ToolDefinition: Guerrilla Mail throwaway address + sid_token
  - temp_email_check ToolDefinition: polls inbox with 5s delays, max 10 attempts
  - identity_retire ToolDefinition: status -> retired + archive all credentials
  - request_operator_credentials ToolDefinition: Discord DM fire-and-forget escalation
  - createIdentityTools(db): convenience factory returning all 7 ToolDefinitions

affects:
  - 06-03 through 06-04: browser automation plans can call identity_create for persona setup
  - apps/agent: createIdentityTools exported from @jarvis/tools for agent startup registry

# Tech tracking
tech-stack:
  added:
    - "@faker-js/faker@^9.5.0 (synthetic persona generation)"
    - "discord.js@^14.16.3 (operator DM escalation)"
  patterns:
    - createXxxTools(db) factory pattern for grouped ToolDefinitions (same as createWalletTools)
    - pgcrypto encrypt/decrypt via raw sql`` template tags (Drizzle cannot express pgp_sym_encrypt natively)
    - CREDENTIAL_ENCRYPTION_KEY loaded at call time from process.env — never stored in DB
    - Audit-on-read: every retrieveCredential call inserts a credential_access_audit row
    - Rotate pattern: UPDATE old to 'rotated', INSERT new active row — preserves history
    - Discord client short-lived per DM: create, login, send, destroy — same as Phase 3 sendOperatorDm
    - Graceful Discord degradation: returns { requested: false, error } if DISCORD_TOKEN not set

key-files:
  created:
    - packages/tools/src/identity/credential-vault.ts
    - packages/tools/src/identity/create-identity.ts
    - packages/tools/src/identity/temp-email.ts
    - packages/tools/src/identity/retire-identity.ts
    - packages/tools/src/identity/operator-escalation.ts
    - packages/tools/src/identity/index.ts
  modified:
    - packages/tools/src/index.ts
    - packages/tools/package.json

key-decisions:
  - "sql`` raw template used for all pgcrypto ops — Drizzle ORM has no native pgp_sym_encrypt/decrypt support, raw SQL is the only correct approach"
  - "CREDENTIAL_ENCRYPTION_KEY throws at call time if missing — fail-fast prevents silent data loss from unencrypted fallback"
  - "retrieveCredential does NOT throw when credential not found — returns null so callers can handle missing creds gracefully"
  - "discord.js added as direct dep to @jarvis/tools — pnpm strict isolation prevents transitive import from @jarvis/ai"
  - "operator-escalation.ts uses dynamic import('discord.js') at runtime — avoids import-time failure when Discord is unconfigured"
  - "Guerrilla Mail polling uses AbortSignal.addEventListener for clean abort during 5s wait — no orphaned timers"
  - "identity/index.ts barrel also re-exports raw vault functions (storeCredential etc.) for internal tool use by future plans"

patterns-established:
  - "Pattern: createIdentityTools(db) factory returns array of ToolDefinitions — same as createWalletTools, enables grouped registration"
  - "Pattern: pgcrypto via raw sql`` — all AES-256 operations use sql tagged template, never Drizzle query builder"
  - "Pattern: audit-on-read in vault — every credential retrieval inserts audit row atomically in same function call"
  - "Pattern: Discord DM fire-and-forget via dynamic import — tool degrades gracefully when DISCORD_TOKEN not configured"

requirements-completed:
  - IDENT-01
  - IDENT-02
  - IDENT-03
  - IDENT-04
  - IDENT-05

# Metrics
duration: 5min
completed: 2026-02-19
---

# Phase 6 Plan 02: Identity Management Tool Group Summary

**7 ToolDefinitions for encrypted credential vault (pgcrypto AES-256 with audit trail), faker persona generation, Guerrilla Mail temp email, identity retirement, and Discord operator escalation**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-19T01:50:54Z
- **Completed:** 2026-02-19T01:56:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Credential vault with pgcrypto AES-256: storeCredential/retrieveCredential/listCredentials/rotateCredential, every retrieval logs audit row
- identity_create tool generates full faker persona and inserts into identities table with master_password encrypted in vault
- Guerrilla Mail integration: temp_email_create returns address+sid_token, temp_email_check polls with 5s delays and abort support
- identity_retire archives all credentials on status transition (locked decision: retired identity = archived credentials)
- request_operator_credentials sends Discord DM fire-and-forget, degrades gracefully when DISCORD_TOKEN not configured
- createIdentityTools(db) factory exports all 7 tools — live DB verified: pgcrypto round-trip PASS, identity insert PASS

## Task Commits

Each task was committed atomically:

1. **Task 1: Create credential vault with pgcrypto encryption and audit logging** - `42b46ac` (feat)
2. **Task 2: Create identity lifecycle tools (create, temp email, retire, operator escalation)** - `f8bf023` (feat)

**Plan metadata:** `775e64f` (docs: complete identity management tool group plan)

## Files Created/Modified
- `packages/tools/src/identity/credential-vault.ts` - storeCredential/retrieveCredential/listCredentials/rotateCredential + credential_store/credential_retrieve ToolDefinition factories
- `packages/tools/src/identity/create-identity.ts` - createIdentityTool: faker persona, identities table insert, vault password storage
- `packages/tools/src/identity/temp-email.ts` - createTempEmailTool (Guerrilla Mail create) + createCheckTempEmailTool (poll with 5s delays)
- `packages/tools/src/identity/retire-identity.ts` - createRetireIdentityTool: status -> retired, credentials -> archived
- `packages/tools/src/identity/operator-escalation.ts` - createRequestOperatorCredentialsTool: Discord DM via short-lived client
- `packages/tools/src/identity/index.ts` - Barrel exports + createIdentityTools(db) factory (7 tools)
- `packages/tools/src/index.ts` - Added createIdentityTools export
- `packages/tools/package.json` - Added @faker-js/faker and discord.js dependencies

## Decisions Made
- Used raw `sql`` template tags for all pgcrypto operations: Drizzle ORM cannot express `pgp_sym_encrypt` or `pgp_sym_decrypt` natively — raw SQL is the only correct approach
- CREDENTIAL_ENCRYPTION_KEY throws at call time if missing: fail-fast prevents silent data loss (no fallback to unencrypted)
- Added discord.js as direct dep to @jarvis/tools: pnpm strict isolation prevents transitive import from @jarvis/ai (same isolation pattern established in Phase 1-2)
- Dynamic import for discord.js in operator-escalation.ts: avoids module-load-time failure when Discord is not configured
- identity/index.ts re-exports raw vault functions alongside ToolDefinitions: future plans (browser automation) need storeCredential/retrieveCredential internally, not just as tools

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `pnpm --filter @jarvis/tools exec tsx -e` with top-level await fails in CJS mode — used temp `.mts` files in the package directory for live verification instead. Not a code issue, purely a verification tooling workaround.

## User Setup Required
- `CREDENTIAL_ENCRYPTION_KEY` must be set in `.env` before agent startup — vault throws with a clear error if missing
- `DISCORD_TOKEN` and `DISCORD_OPERATOR_USER_ID` for operator escalation (optional — tool degrades gracefully if not set)

## Next Phase Readiness
- All 7 identity ToolDefinitions ready for registration in agent startup via createIdentityTools(db)
- pgcrypto encrypt/decrypt verified against live Postgres (port 5433)
- identity_create verified: inserts identity row + stores master_password in credential vault in single execution
- Phases 06-03 and 06-04 (browser automation) can call identity_create to provision fake personas for browser sessions
- No blockers

---
*Phase: 06-browser-identity-and-bootstrapping*
*Completed: 2026-02-19*
