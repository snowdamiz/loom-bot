---
phase: quick
plan: 1
subsystem: app-flow
tags: [setup-wizard, auth, agent-startup, dashboard, chat, db-schema]
dependency_graph:
  requires: []
  provides:
    - setup wizard backend (GET/POST /api/setup/*)
    - chat relay endpoint (POST /api/chat, GET /api/chat/history)
    - setup_state DB table
    - SetupWizard + SidebarChat frontend components
    - DashboardLayout with sidebar
    - Stripped agent startup (12 essential tools)
    - Kill switch activated on first boot
    - Paused seed goal for self-evolution mission
  affects:
    - apps/dashboard (new routes, new app flow)
    - apps/agent (stripped startup, kill switch, seed goal)
    - packages/db (new schema table)
tech_stack:
  added:
    - setup_state Postgres table (Drizzle schema)
  patterns:
    - Hono route modules for setup and chat
    - TanStack Query hooks for setup state and chat history
    - Optimistic UI update in useChat (user message appears immediately)
    - Conditional rendering: AuthGate -> SetupWizard -> DashboardLayout
key_files:
  created:
    - packages/db/src/schema/setup-state.ts
    - apps/dashboard/src/routes/setup.ts
    - apps/dashboard/src/routes/chat.ts
    - apps/dashboard/client/src/hooks/useSetupState.ts
    - apps/dashboard/client/src/hooks/useChat.ts
    - apps/dashboard/client/src/components/SetupWizard.tsx
    - apps/dashboard/client/src/components/SetupStepOpenRouter.tsx
    - apps/dashboard/client/src/components/SetupStepGitHub.tsx
    - apps/dashboard/client/src/components/DashboardLayout.tsx
    - apps/dashboard/client/src/components/SidebarChat.tsx
  modified:
    - packages/db/src/schema/index.ts (export setup-state)
    - apps/dashboard/src/app.ts (mount setup + chat routes)
    - apps/agent/src/index.ts (strip tools, add kill switch + seed goal)
    - apps/dashboard/client/src/App.tsx (new 3-state flow)
    - apps/dashboard/client/src/App.css (wizard + sidebar styles)
decisions:
  - "Used stub for GitHub OAuth (POST /api/setup/github returns pending-oauth) since no OAuth App credentials exist; real exchange added as TODO comment"
  - "Chat endpoint returns static stub reply until agent is active; stored in agentState as chat:history array"
  - "Kill switch activation checks if key is already set in agentState to avoid re-activating on subsequent restarts"
  - "Seed goal uses status='paused' with pauseReason so it exists but supervisor won't run it until operator activates"
  - "No react-router-dom added — 3-state conditional rendering is simpler and matches existing AuthGate pattern"
metrics:
  completed_date: "2026-02-19"
  tasks_completed: 3
  tasks_total: 3
  files_created: 12
  files_modified: 5
---

# Quick Task 1: Ensure App Follows Login -> Setup Wizard -> Dashboard Flow

**One-liner:** App restructured to Login->Setup Wizard (OpenRouter + GitHub stub)->Dashboard with 320px sidebar chat; agent stripped to 12 essential tools and starts OFF with paused self-evolution seed goal.

## What Was Built

### Backend (Task 1)

**Setup state schema** (`packages/db/src/schema/setup-state.ts`)
New `setup_state` table tracking `openrouterKeySet`, `githubConnected`, `githubUsername`, `setupCompletedAt`. Single-row pattern, upserted by setup routes.

**Setup routes** (`apps/dashboard/src/routes/setup.ts`)
- `GET /api/setup` — returns current state with `complete: boolean` derived field
- `POST /api/setup/openrouter` — validates key against OpenRouter `/v1/models`, stores in `agentState` as `config:openrouter_api_key`
- `POST /api/setup/github` — stub: marks connected with `username='pending-oauth'` (TODO: real OAuth exchange)
- `GET /api/setup/github/callback` — placeholder

**Chat relay** (`apps/dashboard/src/routes/chat.ts`)
- `POST /api/chat` — stores user message + static stub reply in `agentState` as `chat:history` array (capped at 50)
- `GET /api/chat/history` — returns stored history

**Agent startup stripped** (`apps/agent/src/index.ts`)
- Removed: `createWalletTools`, `createBrowserTools`, `createIdentityTools`, `SignerClient`, `BrowserManager`, `subscribeToWallet`, `fork`, `createRequire`
- Kept: shell, http, file, db (4 primitives), spawn/await/cancel_agent (3 multi-agent), package_install/tool_discover (2 bootstrap), tool_write/tool_delete/schema_extend (3 self-extension) = 12 total
- Added: kill switch activation on first boot (if `kill_switch` key not in agentState)
- Added: paused seed goal insert if goals table is empty

### Frontend (Task 2)

**useSetupState hook** — TanStack Query for `GET /api/setup`, returns `SetupState` with `complete` flag

**useChat hook** — loads history on mount, optimistic user message append, POST to `/api/chat`

**SetupStepOpenRouter** — step 1 UI: password input for API key, calls `/api/setup/openrouter`, shows error on invalid key, links to openrouter.ai/keys

**SetupStepGitHub** — step 2 UI: "Connect GitHub" and "Skip for Now" both call `/api/setup/github` with code `manual-setup` (stub behavior)

**SetupWizard** — wraps both steps in centered card with progress dots, skips to step 2 if OpenRouter already set

**SidebarChat** — 320px fixed sidebar, message bubbles (user=dark/right, assistant=light/left), auto-scroll to bottom, Enter key sends

**DashboardLayout** — flex container with `dashboard-main` (flex:1) + `dashboard-sidebar` (320px sticky), collapses to column on mobile <768px

**App.tsx flow** — `AuthGate` -> `AppContent` (loading state, then `SetupWizard` or `DashboardLayout`)

**App.css additions** — `.dashboard-layout`, `.dashboard-sidebar`, `.sidebar-chat`, `.chat-messages`, `.chat-message--user/assistant`, `.wizard-*`, `.btn-primary`, `.loading-page`

### Build (Task 3)

Full `pnpm -r build` passes across all 11 packages. SPA bundle updated at `apps/dashboard/public/assets/`.

## Deviations from Plan

None — plan executed exactly as written. The GitHub stub approach was explicitly specified in the plan as the correct call since no OAuth App credentials are configured.

## Self-Check

### Created files exist:
- `packages/db/src/schema/setup-state.ts` — FOUND
- `apps/dashboard/src/routes/setup.ts` — FOUND
- `apps/dashboard/src/routes/chat.ts` — FOUND
- `apps/dashboard/client/src/hooks/useSetupState.ts` — FOUND
- `apps/dashboard/client/src/hooks/useChat.ts` — FOUND
- `apps/dashboard/client/src/components/SetupWizard.tsx` — FOUND
- `apps/dashboard/client/src/components/SetupStepOpenRouter.tsx` — FOUND
- `apps/dashboard/client/src/components/SetupStepGitHub.tsx` — FOUND
- `apps/dashboard/client/src/components/DashboardLayout.tsx` — FOUND
- `apps/dashboard/client/src/components/SidebarChat.tsx` — FOUND
- `apps/dashboard/public/index.html` — FOUND
- `apps/dashboard/public/assets/index-qmMCFVF7.js` — FOUND

### Commits exist:
- `46bb38b` — feat(quick-1): backend setup wizard, chat endpoint, and stripped agent startup
- `192f39d` — feat(quick-1): frontend login, setup wizard, and dashboard with sidebar chat
- `e36f60d` — chore(quick-1): rebuild compiled SPA bundle with updated app flow

### Build verification:
- `pnpm -r build` exits 0 — PASSED
- `npx tsc --noEmit` (client) — PASSED
- `npx vite build` — PASSED
- No wallet/browser/identity imports in agent startup — CONFIRMED
- Bootstrap + self-extension tools present — CONFIRMED

## Self-Check: PASSED
