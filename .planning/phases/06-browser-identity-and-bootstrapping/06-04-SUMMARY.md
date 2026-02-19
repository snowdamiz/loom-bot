---
phase: 06-browser-identity-and-bootstrapping
plan: 04
subsystem: api
tags: [bootstrap, pnpm, dynamic-import, tool-registry, browser-lifecycle, identity-ledger, hono]

# Dependency graph
requires:
  - phase: 06-02
    provides: createIdentityTools factory (7 identity/credential tools)
  - phase: 06-03
    provides: createBrowserTools factory (8 browser automation tools) + BrowserManager
  - phase: 06-01
    provides: identities, identity_accounts, credentials, credentialAccessAudit DB tables

provides:
  - createBootstrapTools(registry): package_install + tool_discover (BOOT-01, BOOT-02)
  - Agent process registers all 17 Phase 6 tools at startup (8 browser + 7 identity + 2 bootstrap)
  - Browser lifecycle cleanup on SIGTERM/SIGINT (ShutdownBrowserManager)
  - Dashboard identity ledger API: GET /api/identities + GET /api/identities/:id/accounts

affects: [Phase 7, Phase 8, self-extension, runtime-capabilities]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "createBootstrapTools(registry) factory — bootstrap tools receive registry by reference so tool_discover always reflects live state"
    - "pnpm add via spawn() in project cwd — agent self-installs packages at runtime without restart"
    - "Dynamic import after pnpm install — verifies package loaded, lists top-level exports"
    - "ShutdownBrowserManager duck-typed interface — keeps shutdown.ts decoupled from @jarvis/browser"
    - "Phase 6 tools registered sequentially after Phase 4 wallet section; openAITools re-derived once"
    - "Identity ledger API returns credential metadata only (never encryptedValue)"

key-files:
  created:
    - packages/tools/src/bootstrap/install-package.ts
    - packages/tools/src/bootstrap/discover-tool.ts
    - packages/tools/src/bootstrap/index.ts
    - apps/dashboard/src/routes/identities.ts
  modified:
    - packages/tools/src/index.ts
    - apps/agent/src/index.ts
    - apps/agent/src/shutdown.ts
    - apps/agent/package.json
    - apps/dashboard/src/app.ts

key-decisions:
  - "process.cwd() used for pnpm install projectRoot — agent always runs from monorepo root, avoids fragile URL path resolution"
  - "parsePackageName handles scoped packages (@scope/name@version) via double-split on '@' after extracting scope prefix"
  - "importAfterInstall defaults true — verifies package loaded and lists top-level exports; non-fatal if import fails (package still installed)"
  - "tool_discover accepts registry by reference — always reflects current registration state including post-startup additions"
  - "browserManager passed as ShutdownBrowserManager to shutdown handler — cast satisfies structural interface without importing @jarvis/browser in shutdown.ts"
  - "CREDENTIAL_ENCRYPTION_KEY absence emits warning but does not crash — identity tools degrade gracefully per Phase 6 design"

patterns-established:
  - "Self-provisioning pattern: agent installs + imports packages at runtime via package_install, then uses new capabilities immediately"
  - "Registry introspection pattern: tool_discover lets agent audit its own capabilities to identify gaps before installing"

requirements-completed: [BOOT-01, BOOT-02, BOOT-03, BOOT-04, IDENT-06]

# Metrics
duration: 3min
completed: 2026-02-18
---

# Phase 6 Plan 04: Bootstrap Tools, Agent Wiring, and Identity Ledger API Summary

**Runtime pnpm self-install + tool discovery bootstrap group, all 17 Phase 6 tools registered in agent, browser zombie prevention via shutdown hook, and identity ledger API for operator audit**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-19T01:58:45Z
- **Completed:** 2026-02-19T02:01:45Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- package_install tool: agent can install any npm package via pnpm add at runtime and immediately dynamic-import it — enables on-demand capability expansion (Browser Use, DevTools MCP, etc.)
- tool_discover tool: agent can introspect its own registered tools (name, description, inputSchema) and filter by keyword to identify capability gaps
- All 17 Phase 6 tools registered in the agent process (8 browser + 7 identity + 2 bootstrap); openAITools re-derived so LLM sees the full expanded toolset
- Browser manager lifetime managed across shutdown — BrowserManager.close() called before supervisor stop, preventing zombie Chromium processes
- Dashboard identity ledger API exposes paginated identity list with status filter, plus per-identity audit view showing accounts, credential metadata (no encrypted values), and access audit trail

## Task Commits

Each task was committed atomically:

1. **Task 1: Create bootstrap tools** - `905c76d` (feat)
2. **Task 2: Wire Phase 6 tools into agent, shutdown handler, and dashboard identity API** - `e05fe6e` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `packages/tools/src/bootstrap/install-package.ts` - createInstallPackageTool(): BOOT-01 pnpm add + dynamic import; scoped package name parsing; 120s timeout; shell:false
- `packages/tools/src/bootstrap/discover-tool.ts` - createDiscoverToolTool(registry): BOOT-02 list/filter all registered tools by name or description
- `packages/tools/src/bootstrap/index.ts` - barrel export + createBootstrapTools(registry) factory returning both tools
- `packages/tools/src/index.ts` - added export { createBootstrapTools } from './bootstrap/index.js'
- `apps/agent/src/index.ts` - Phase 6 section: BrowserManager instantiation, register all 17 tools, CREDENTIAL_ENCRYPTION_KEY warning
- `apps/agent/src/shutdown.ts` - ShutdownBrowserManager interface; browser.close() at step 2.5; browserManager in ShutdownResources
- `apps/agent/package.json` - @jarvis/browser added as direct dependency
- `apps/dashboard/src/routes/identities.ts` - GET /api/identities (paginated, status filter) + GET /api/identities/:id/accounts (accounts + credential metadata + audit log)
- `apps/dashboard/src/app.ts` - mount identities route under /api before static files

## Decisions Made

- `process.cwd()` used for pnpm install project root — agent process always starts from monorepo root so cwd is reliable; avoids URL-based path resolution which is fragile across Node versions
- Scoped package name parsing handles `@scope/name@version` via extracting scope prefix first, then stripping version from name part — all 7 test cases verified
- `importAfterInstall` defaults true — post-install import validates the package actually loads correctly; if import fails (e.g., browser-only package), returns imported:false but installed:true without crashing
- `tool_discover` receives registry by reference — live reflection of all tools, including those added after startup via future self-extension
- Browser manager cast to `ShutdownBrowserManager` structural interface — satisfies TypeScript without importing @jarvis/browser in shutdown.ts (follows Phase 4 duck-typing pattern for signer process)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. All builds passed on first attempt. No import or type errors.

## User Setup Required

The following environment variables should be configured:

- `CREDENTIAL_ENCRYPTION_KEY`: Required for encrypted credential vault. Generate with `openssl rand -base64 32`. Agent warns on startup if missing but does not crash.
- `TWO_CAPTCHA_API_KEY`: Optional. Enables CAPTCHA solving for browser automation. Agent degrades gracefully without it.

## Next Phase Readiness

Phase 6 is complete. All four plans executed:
- 06-01: Database schema (identities, identity_accounts, credentials, credential_access_audit)
- 06-02: Identity tool group (7 tools: create, vault, temp-email, retire, operator escalation)
- 06-03: Browser tool group (8 tools: session, navigate, click, fill, extract, screenshot)
- 06-04: Bootstrap tools + agent wiring + shutdown cleanup + identity ledger API

Phase 7 (Strategy Engine) is the next milestone. The agent now has self-provisioning capability — it can install Browser Use, DevTools MCP, or any other package at runtime when it determines those tools would be useful.

---
*Phase: 06-browser-identity-and-bootstrapping*
*Completed: 2026-02-18*
