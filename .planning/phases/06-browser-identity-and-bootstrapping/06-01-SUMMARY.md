---
phase: 06-browser-identity-and-bootstrapping
plan: 01
subsystem: database, browser
tags: [drizzle, playwright, playwright-extra, stealth, 2captcha, pgcrypto, bytea, uuid, identity, credentials]

# Dependency graph
requires:
  - phase: 01-infrastructure
    provides: @jarvis/db package, Drizzle ORM setup, Postgres connection

provides:
  - identities table with persona JSONB, status lifecycle, risk score (UUID PK)
  - identity_accounts table with service/purpose tracking
  - credentials table with AES-256 encrypted bytea column via pgcrypto
  - credential_access_audit table with denormalized identityId
  - pgcrypto extension enabled in Postgres (pgp_sym_encrypt/pgp_sym_decrypt verified)
  - "@jarvis/browser package with BrowserManager, BrowserSession, getStealthChromium, CaptchaSolver"
  - Playwright Chromium binary installed at ~/.cache/ms-playwright/chromium-1208
affects:
  - 06-02 through 06-07: all identity and browser tool plans depend on these schemas and package

# Tech tracking
tech-stack:
  added:
    - playwright@^1.50.1 (browser automation)
    - playwright-extra@^4.3.6 (plugin system for playwright)
    - puppeteer-extra-plugin-stealth@^2.11.2 (bot fingerprint evasion)
    - "@2captcha/captcha-solver@^1.3.2 (automated CAPTCHA resolution)"
    - pgcrypto Postgres extension (AES-256 symmetric encryption)
  patterns:
    - Co-locate FK-related tables in one schema file to avoid drizzle-kit CJS bundler .js resolution failure
    - credentials.ts and credential-audit.ts as re-export shims pointing at identities.ts
    - customType bytea for pgcrypto binary output (never text — would corrupt binary)
    - BrowserManager as non-singleton (caller manages lifecycle)
    - Stealth plugin double-registration guard via module-level boolean flag
    - CaptchaSolver graceful degradation — isAvailable() false when no apiKey

key-files:
  created:
    - packages/db/src/schema/identities.ts
    - packages/db/src/schema/credentials.ts
    - packages/db/src/schema/credential-audit.ts
    - packages/browser/package.json
    - packages/browser/tsconfig.json
    - packages/browser/src/index.ts
    - packages/browser/src/manager.ts
    - packages/browser/src/session.ts
    - packages/browser/src/stealth.ts
    - packages/browser/src/captcha.ts
  modified:
    - packages/db/src/schema/index.ts
    - packages/db/drizzle.config.ts

key-decisions:
  - "All 4 identity/credential tables co-located in identities.ts — drizzle-kit CJS bundler cannot resolve .js cross-file FK imports (same pattern as goals.ts + sub_goals)"
  - "credentials.ts and credential-audit.ts are re-export shims only — drizzle.config.ts only references identities.ts to avoid duplicate symbol errors"
  - "customType bytea for encryptedValue — pgcrypto pgp_sym_encrypt returns raw binary; text column would corrupt it"
  - "BrowserManager is NOT a singleton — caller manages lifecycle for flexibility"
  - "playwright-extra cloudflareTurnstile method name (not 'turnstile') — discovered from @2captcha type definitions"
  - "@types/node added as devDependency to @jarvis/browser — required for node:fs import in session.ts"

patterns-established:
  - "Pattern: drizzle-kit CJS FK isolation — co-locate tables with FK relationships in one .ts file, use re-export shims for named-file organization"
  - "Pattern: bytea customType for pgcrypto — always use bytea not text for encrypted columns"
  - "Pattern: CaptchaSolver.isAvailable() guard — callers check availability before calling solve methods"

requirements-completed:
  - BROWSER-05
  - IDENT-03
  - IDENT-06

# Metrics
duration: 8min
completed: 2026-02-19
---

# Phase 6 Plan 01: Browser Identity and Bootstrapping Summary

**4-table identity+credential schema with pgcrypto AES-256 encryption plus @jarvis/browser package (Playwright + stealth plugin + 2captcha CAPTCHA solver) providing the shared foundation for all Phase 6 plans**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-19T01:39:33Z
- **Completed:** 2026-02-19T01:47:49Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Created 4 Postgres tables: identities, identity_accounts, credentials, credential_access_audit — all live in Postgres via db:push
- Enabled pgcrypto extension and verified AES-256 encrypt/decrypt round-trip (pgp_sym_encrypt/pgp_sym_decrypt)
- Created @jarvis/browser package with BrowserManager (lazy Playwright launch), BrowserSession (per-identity BrowserContext with proxy isolation), stealth plugin, and CaptchaSolver (reCAPTCHA v2, hCaptcha, Turnstile)
- Installed Playwright Chromium binary (v1.50.1 / Chrome 145)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create identity and credential database schemas with pgcrypto** - `a1ae5b4` (feat)
2. **Task 2: Create @jarvis/browser package with Playwright lifecycle, stealth, and CAPTCHA** - `7b9140f` (feat)

**Plan metadata:** *(upcoming docs commit)*

## Files Created/Modified
- `packages/db/src/schema/identities.ts` - All 4 identity/credential tables co-located (identities, identityAccounts, credentials, credentialAccessAudit) with bytea customType for pgcrypto
- `packages/db/src/schema/credentials.ts` - Re-export shim pointing to identities.ts
- `packages/db/src/schema/credential-audit.ts` - Re-export shim pointing to identities.ts
- `packages/db/src/schema/index.ts` - Added barrel exports for 3 new schema files
- `packages/db/drizzle.config.ts` - Added identities.ts to schema array (only — shims excluded)
- `packages/browser/package.json` - @jarvis/browser workspace package with playwright deps
- `packages/browser/tsconfig.json` - Extends @jarvis/typescript-config/base.json, composite: true
- `packages/browser/src/stealth.ts` - getStealthChromium() with singleton registration guard
- `packages/browser/src/manager.ts` - BrowserManager: lazy launch, getBrowser, close, isRunning
- `packages/browser/src/session.ts` - BrowserSession: per-identity BrowserContext with proxy, storageState, UA
- `packages/browser/src/captcha.ts` - CaptchaSolver: reCAPTCHA v2, hCaptcha, Cloudflare Turnstile via 2captcha
- `packages/browser/src/index.ts` - Barrel export of all public APIs

## Decisions Made
- Co-located all 4 DB tables in identities.ts: drizzle-kit's CJS bundler (esbuild-register) cannot resolve `.js` extension imports back to `.ts` source files when schema files are listed separately in drizzle.config.ts. Same pattern as goals.ts + sub_goals.
- Used bytea customType for encryptedValue: pgcrypto output is raw binary; storing in a text column would corrupt the encrypted data.
- Made BrowserManager a non-singleton: callers manage browser lifecycle (one per agent run, or shared) depending on their needs.
- @types/node added as devDep: needed for `node:fs` import in session.ts; other packages avoided this by importing Node APIs without explicit `node:` prefix.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Co-located all 4 tables in identities.ts (drizzle-kit FK resolution)**
- **Found during:** Task 1 (db:push)
- **Issue:** drizzle-kit's CJS bundler failed with `Cannot find module './identities.js'` when credentials.ts imported from identities.ts via `.js` extension — esbuild-register resolves CJS but cannot map `.js` back to `.ts` source files
- **Fix:** Moved credentials and credentialAccessAudit tables into identities.ts; made credentials.ts and credential-audit.ts re-export shims; drizzle.config.ts now only lists identities.ts
- **Files modified:** packages/db/src/schema/identities.ts, credentials.ts, credential-audit.ts, drizzle.config.ts
- **Verification:** db:push succeeded; all 4 tables confirmed in Postgres
- **Committed in:** a1ae5b4 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed captcha solveTurnstile method name**
- **Found during:** Task 2 (build)
- **Issue:** Plan spec said `solver.turnstile()` but actual @2captcha/captcha-solver v1.3.2 method is `solver.cloudflareTurnstile()` — checked type definitions
- **Fix:** Updated captcha.ts to call `this.solver!.cloudflareTurnstile()`
- **Files modified:** packages/browser/src/captcha.ts
- **Verification:** Build passes with correct method name
- **Committed in:** 7b9140f (Task 2 commit)

**3. [Rule 3 - Blocking] Added @types/node devDependency**
- **Found during:** Task 2 (build)
- **Issue:** TypeScript error TS2307 "Cannot find module 'node:fs'" — @jarvis/browser had no @types/node
- **Fix:** Added `"@types/node": "^22.0.0"` to devDependencies; ran pnpm install
- **Files modified:** packages/browser/package.json, pnpm-lock.yaml
- **Verification:** Build passes, node:fs import resolved
- **Committed in:** 7b9140f (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All fixes were necessary for correctness. The FK co-location follows an established project pattern. No scope creep.

## Issues Encountered
- Docker was not running when db:push was first attempted — opened Docker Desktop and started containers via `docker compose up -d`

## User Setup Required
None — no external service configuration required. TWO_CAPTCHA_API_KEY for CAPTCHA solving is optional (solver degrades gracefully when not configured).

## Next Phase Readiness
- All Phase 6 subsequent plans (02-07) can now proceed: identity schemas are live, @jarvis/browser exports are available
- pgcrypto extension is enabled and tested — credential storage tools can be built immediately
- Playwright Chromium binary installed — browser tools can launch headless browser immediately
- No blockers

---
*Phase: 06-browser-identity-and-bootstrapping*
*Completed: 2026-02-19*
