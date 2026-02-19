---
phase: 06-browser-identity-and-bootstrapping
plan: 03
subsystem: browser
tags: [playwright, playwright-extra, stealth, browser-automation, session-management]

# Dependency graph
requires:
  - phase: 06-01
    provides: BrowserManager, BrowserSession, stealth Chromium, @jarvis/browser package
provides:
  - 8 browser ToolDefinitions: browser_session_open/close/save, browser_navigate, browser_click, browser_fill, browser_extract, browser_screenshot
  - createBrowserTools(browserManager) convenience factory
  - activeSessions Map<string, ActiveSession> shared state for all browser tools
  - Human-like click (mouse path simulation) and human-like typing (typeDelay keystroke events)
affects:
  - 06-04-identity-bootstrapping
  - apps/agent (browser tools registration)

# Tech tracking
tech-stack:
  added:
    - "@jarvis/browser: workspace:* added to @jarvis/tools dependencies"
    - "playwright: ^1.50.1 added as direct dep to @jarvis/tools (for Page type under pnpm strict isolation)"
  patterns:
    - "createBrowserTools(manager) factory pattern — same as createWalletTools(db, signerClient)"
    - "activeSessions module-level Map — shared state between session and operation tools"
    - "getSession(sessionId) helper — throws descriptive error for missing sessions"
    - "humanLike flag pattern — exposes stealth capability to agent, agent decides when to use"
    - "typeDelay pattern — exposes human keystroke timing to agent, agent decides when to use"
    - "try/catch -> return { error } pattern — all tools return errors, never throw"

key-files:
  created:
    - packages/tools/src/browser/_state.ts
    - packages/tools/src/browser/navigate.ts
    - packages/tools/src/browser/interact.ts
    - packages/tools/src/browser/screenshot.ts
    - packages/tools/src/browser/session-manage.ts
    - packages/tools/src/browser/index.ts
  modified:
    - packages/tools/package.json
    - packages/tools/src/index.ts

key-decisions:
  - "playwright added as direct dep to @jarvis/tools (not transitive from @jarvis/browser) — pnpm strict isolation requires direct deps for Page type imports"
  - "BrowserSession imported statically not dynamically — @jarvis/browser is a direct dep, static import is cleaner and TypeScript resolves types correctly"
  - "humanLike click uses page.mouse.move(x, y, { steps: N }) not page.hover() — steps parameter creates intermediate mouse positions simulating human path, per locked stealth decision"
  - "typeDelay uses page.type() not page.fill() — page.type() fires keydown/keypress/keyup per char, page.fill() sets value instantaneously; typeDelay exposes choice to agent"
  - "browser_extract truncates at 10,000 chars per item — prevents LLM context overflow from large page extractions"
  - "browser_screenshot caps at 500KB base64 — PNG screenshots can be very large, 500KB is practical limit for LLM context"
  - "data/sessions/{identityId}.json as default save path — predictable location per identity, auto-creates directory"

patterns-established:
  - "Browser tool group follows wallet tool group pattern: createBrowserTools(dep) factory returning ToolDefinition[]"
  - "Shared state module (_state.ts) for tool groups that need cross-tool coordination"
  - "Stealth capabilities exposed as optional flags (humanLike, typeDelay) — agent decides per-situation, not hardcoded"

requirements-completed: [BROWSER-01, BROWSER-02, BROWSER-03, BROWSER-04]

# Metrics
duration: 3min
completed: 2026-02-19
---

# Phase 06 Plan 03: Browser Automation Tool Group Summary

**8 Playwright browser automation ToolDefinitions (navigate, click with humanLike mouse path, fill with typeDelay keystroke simulation, extract, screenshot, session open/close/save) via createBrowserTools(browserManager) factory**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-19T01:50:50Z
- **Completed:** 2026-02-19T01:53:50Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Created 8 browser ToolDefinitions covering the full browser automation workflow: session lifecycle, navigation, form interaction, content extraction, and screenshots
- Implemented human-like stealth capabilities: `humanLike` flag on browser_click uses `page.mouse.move()` with random intermediate steps and random target offsets; `typeDelay` on browser_fill uses `page.type()` for per-keystroke events
- All tools follow established ToolDefinition error-handling pattern (try/catch -> return `{ error }`, never throw)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create browser navigation and interaction tools** - `caf1be4` (feat)
2. **Task 2: Create browser session lifecycle tools and barrel export** - `c94a326` (feat)

**Plan metadata:** (to be committed with this SUMMARY)

## Files Created/Modified

- `packages/tools/src/browser/_state.ts` - Shared `activeSessions` Map, `getSession()` helper, `generateSessionId()` — cross-tool state for all browser tools
- `packages/tools/src/browser/navigate.ts` - `browser_navigate`: page.goto with configurable waitUntil, 30s timeout, returns url/title/status
- `packages/tools/src/browser/interact.ts` - `browser_click` (humanLike mouse path via mouse.move steps), `browser_fill` (typeDelay keystroke simulation via page.type), `browser_extract` (text/attribute extraction, 10K char cap)
- `packages/tools/src/browser/screenshot.ts` - `browser_screenshot`: full page or element PNG capture, 500KB base64 cap
- `packages/tools/src/browser/session-manage.ts` - `browser_session_open/close/save`: BrowserSession lifecycle via BrowserManager injection
- `packages/tools/src/browser/index.ts` - Barrel export + `createBrowserTools(browserManager)` factory returning all 8 tools
- `packages/tools/package.json` - Added `@jarvis/browser: workspace:*` and `playwright: ^1.50.1` as direct dependencies
- `packages/tools/src/index.ts` - Added `export { createBrowserTools } from './browser/index.js'`

## Decisions Made

- playwright added as direct dep (not transitive) to @jarvis/tools — pnpm strict isolation requires explicit dependencies for Page type imports
- BrowserSession imported statically (not dynamically) — @jarvis/browser is a direct dep, static import is correct
- humanLike click uses `page.mouse.move(x, y, { steps: N })` with random position within bounding box (±30% offset from center) — simulates natural non-straight mouse paths per locked stealth decision
- typeDelay uses `page.type()` which fires individual keydown/keypress/keyup events per character — unlike `page.fill()` which is instantaneous
- browser_extract truncates at 10,000 chars to prevent LLM context overflow
- browser_screenshot caps output at 500KB base64 with truncation warning if exceeded

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Build passed cleanly on first attempt. The tsx eval verification failed due to relative `.js` path resolution in eval mode, but was verified successfully using the built `dist/` files.

## User Setup Required

None - no external service configuration required. Playwright and @jarvis/browser are workspace dependencies already installed.

## Next Phase Readiness

- Browser tool group complete and exported from @jarvis/tools
- `createBrowserTools(browserManager)` ready for registration in apps/agent alongside existing createDefaultRegistry
- Plan 06-04 (identity bootstrapping) can now use browser tools to perform actual web account creation flows

---
*Phase: 06-browser-identity-and-bootstrapping*
*Completed: 2026-02-19*
