---
phase: 05-web-dashboard
plan: 02
subsystem: ui
tags: [react, vite, typescript, tanstack-query, sse, fetch-event-source, auth-gate, dashboard]

# Dependency graph
requires:
  - phase: 05-01
    provides: Hono API server with /api/status, /api/kill-switch, /api/sse endpoints
provides:
  - React/Vite SPA at apps/dashboard/client serving on port 5173 in dev
  - AuthGate component: full-page token login with sessionStorage persistence and auto-validate on mount
  - useSSE hook: SSE via @microsoft/fetch-event-source with Authorization header support
  - useAgentStatus: TanStack Query polling fallback (5s interval) + SSE cache injection
  - useKillSwitch: useMutation for POST /api/kill-switch with query invalidation
  - OverviewTab: compact 4-card grid (status/uptime, current goal, activity link, kill switch)
  - KillSwitchButton: activate/deactivate toggle with confirmation dialog requiring reason text
  - App.css: clean minimal design system (card grid, tab bar, modal, skeleton, buttons)
  - build.outDir: ../public — Vite builds directly to apps/dashboard/public/ for Hono serveStatic
affects: [05-web-dashboard (Plan 03 will add activity tab and P&L tab consuming these hooks)]

# Tech tracking
tech-stack:
  added:
    - react@18.3.1 (React UI library)
    - react-dom@18.3.1 (React DOM renderer)
    - "@tanstack/react-query@5.62.0 (server state + caching)"
    - "@microsoft/fetch-event-source@2.0.1 (SSE with Authorization header)"
    - vite@5.4.21 (Vite bundler/dev server)
    - "@vitejs/plugin-react@4.3.4 (React plugin for Vite)"
    - "@types/react@18.3.12 / @types/react-dom@18.3.1 (TypeScript types)"
  patterns:
    - SSE via fetchEventSource with Authorization header (native EventSource cannot send headers)
    - TanStack Query + SSE dual-track: SSE feeds setQueryData for immediate updates, polling as fallback
    - sessionStorage token storage (not localStorage — clears on tab close for security)
    - Vite proxy for /api/* routes — dev server forwards to localhost:3001 API
    - Standalone tsconfig with moduleResolution:bundler (NOT NodeNext) — Vite handles module resolution

key-files:
  created:
    - apps/dashboard/client/package.json
    - apps/dashboard/client/tsconfig.json
    - apps/dashboard/client/vite.config.ts
    - apps/dashboard/client/index.html
    - apps/dashboard/client/src/main.tsx
    - apps/dashboard/client/src/App.tsx
    - apps/dashboard/client/src/App.css
    - apps/dashboard/client/src/lib/api.ts
    - apps/dashboard/client/src/hooks/useSSE.ts
    - apps/dashboard/client/src/hooks/useAgentData.ts
    - apps/dashboard/client/src/components/AuthGate.tsx
    - apps/dashboard/client/src/components/OverviewTab.tsx
    - apps/dashboard/client/src/components/KillSwitchButton.tsx
  modified:
    - pnpm-workspace.yaml

key-decisions:
  - "pnpm-workspace.yaml needs explicit apps/dashboard/client entry — apps/* glob only matches direct subdirectories of apps/, not nested paths"
  - "Client tsconfig uses moduleResolution:bundler not NodeNext — Vite handles module resolution, NodeNext causes TS errors with .js imports in React"
  - "useSSE onerror: throw on 401 to stop fetchEventSource reconnect loop, otherwise let it reconnect automatically"
  - "KillSwitchButton dialog uses styled modal overlay not browser confirm() — better UX per plan spec"
  - "App.tsx imports React removed (unused) — react-jsx transform handles JSX, no explicit React import needed"

patterns-established:
  - "SSE + polling dual-track: fetchEventSource calls setQueryData for immediate push; useQuery polls as fallback — seamless merge in UI"
  - "AuthGate auto-login: reads token from sessionStorage on mount, validates against /api/status, shows login form if invalid/missing"
  - "Confirmation dialog pattern: modal overlay with backdrop, required reason input, inline error, disable-during-mutation"

requirements-completed: [DASH-01, DASH-05, DASH-06]

# Metrics
duration: 5min
completed: 2026-02-19
---

# Phase 05 Plan 02: Dashboard React SPA Summary

**React/Vite SPA with token auth gate, real-time SSE via fetchEventSource, TanStack Query polling fallback, Overview tab with 4-card status grid, and kill switch confirmation dialog**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-19T00:24:07Z
- **Completed:** 2026-02-19T00:29:27Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- Full React/Vite SPA scaffold: package.json, tsconfig (bundler mode), vite.config with API proxy, HTML entry
- Token auth gate with sessionStorage persistence, auto-validate on mount, invalid-token error display
- Real-time SSE hook via @microsoft/fetch-event-source (supports Authorization headers, native EventSource cannot)
- TanStack Query hooks: useAgentStatus (5s polling fallback) + useKillSwitch mutation with cache invalidation
- Overview tab: status card (alive/halted badge, uptime, system status), current goal card, activity link card, kill switch card
- Kill switch button: red/green toggle, confirmation dialog with required reason input, loading state, error display
- App.css: comprehensive minimal design system (card grid, tab bar, modal overlay, skeleton shimmer, button variants)

## Task Commits

Each task was committed atomically:

1. **Task 1: React/Vite SPA scaffold + auth gate + hooks** - `eb2e230` (feat)
2. **Task 2: Overview tab with status cards and kill switch** - `1ae61d0` (feat)

**Plan metadata:** (committed with SUMMARY.md below)

## Files Created/Modified
- `apps/dashboard/client/package.json` - @jarvis/dashboard-client package definition
- `apps/dashboard/client/tsconfig.json` - TypeScript config with moduleResolution:bundler for Vite
- `apps/dashboard/client/vite.config.ts` - Vite config with /api proxy and build.outDir: ../public
- `apps/dashboard/client/index.html` - HTML entry with #root div
- `apps/dashboard/client/src/main.tsx` - React root: QueryClientProvider wrapping App
- `apps/dashboard/client/src/App.tsx` - Tab container (Overview/Activity), SSE connection, cache injection
- `apps/dashboard/client/src/App.css` - Minimal design system: cards, tabs, modal, skeleton, buttons
- `apps/dashboard/client/src/lib/api.ts` - Token storage + apiFetch/apiJson with 401 auto-clear
- `apps/dashboard/client/src/hooks/useSSE.ts` - SSE hook via fetchEventSource with auth header
- `apps/dashboard/client/src/hooks/useAgentData.ts` - useAgentStatus query + useKillSwitch mutation
- `apps/dashboard/client/src/components/AuthGate.tsx` - Full-page login form with auto-validate
- `apps/dashboard/client/src/components/OverviewTab.tsx` - 4-card status grid with skeleton/error states
- `apps/dashboard/client/src/components/KillSwitchButton.tsx` - Toggle button with confirmation modal
- `pnpm-workspace.yaml` - Added apps/dashboard/client explicit entry

## Decisions Made
- Added `apps/dashboard/client` explicitly to pnpm-workspace.yaml — the `apps/*` glob only picks up direct subdirectories of `apps/`, not nested paths like `apps/dashboard/client`
- Removed `import React` from App.tsx — with `jsx: "react-jsx"` transform, explicit React import is not needed and triggers `noUnusedLocals` error
- Used `moduleResolution: "bundler"` in client tsconfig — Vite requires this; NodeNext would fail on .js extension imports in React component files

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added apps/dashboard/client to pnpm-workspace.yaml**
- **Found during:** Task 1 (pnpm install after creating package.json)
- **Issue:** `pnpm install` did not recognize `@jarvis/dashboard-client` — the workspace pattern `apps/*` only matches direct subdirectories of `apps/`, not nested paths. `apps/dashboard/client` is inside `apps/dashboard/`, so it was invisible to pnpm
- **Fix:** Added explicit `- 'apps/dashboard/client'` entry to pnpm-workspace.yaml; ran `pnpm install` which installed all 67 new packages
- **Files modified:** pnpm-workspace.yaml, pnpm-lock.yaml
- **Verification:** `pnpm list --recursive` showed `@jarvis/dashboard-client@0.0.1`
- **Committed in:** eb2e230 (Task 1 commit)

**2. [Rule 3 - Blocking] Removed unused React import in App.tsx**
- **Found during:** Task 1 (TypeScript compilation check)
- **Issue:** `import React from 'react'` triggered TS6133 noUnusedLocals — with `jsx: "react-jsx"` the transform handles JSX automatically without an explicit React import
- **Fix:** Changed to only import `{ useState, useCallback }` from 'react'
- **Files modified:** apps/dashboard/client/src/App.tsx
- **Verification:** `tsc --noEmit` passed with zero errors
- **Committed in:** eb2e230 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both auto-fixes required for correct workspace setup and TypeScript compilation. No scope creep.

## Issues Encountered
- Port 5173 was occupied during Vite server verification — Vite automatically tried 5174, 5175... and settled on 5178. Server started and served correctly. In production the server port doesn't matter since Hono serves the built files statically.

## User Setup Required
None — no additional environment variables required beyond what was documented in 05-01:
- `DASHBOARD_TOKEN` — required for API server
- `DATABASE_URL` — required for live data

Start dev: `DASHBOARD_TOKEN=<secret> pnpm --filter @jarvis/dashboard dev` (API) + `pnpm --filter @jarvis/dashboard-client dev` (Vite)

## Next Phase Readiness
- SPA scaffold complete and TypeScript clean
- Auth gate, Overview tab, kill switch all implemented
- Plan 03 (Activity tab + P&L tab) can use the established hooks (useSSE onActivity already wires into query invalidation)
- Vite build outputs to `apps/dashboard/public/` where Hono's serveStatic will pick it up for production serving

## Self-Check: PASSED

All 13 created files verified present on disk.
pnpm-workspace.yaml updated and verified (@jarvis/dashboard-client appears in `pnpm list --recursive`).
Task commits eb2e230 (Task 1) and 1ae61d0 (Task 2) confirmed in git log.
TypeScript compilation passes with zero errors.

---
*Phase: 05-web-dashboard*
*Completed: 2026-02-19*
