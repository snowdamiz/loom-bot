---
phase: quick
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  # Backend - new routes + modified startup
  - apps/dashboard/src/routes/setup.ts
  - apps/dashboard/src/routes/chat.ts
  - apps/dashboard/src/app.ts
  - apps/dashboard/src/middleware/auth.ts
  - apps/agent/src/index.ts
  # Database - setup state schema
  - packages/db/src/schema/setup-state.ts
  - packages/db/src/schema/index.ts
  - packages/db/src/index.ts
  # Frontend - full restructure
  - apps/dashboard/client/src/App.tsx
  - apps/dashboard/client/src/App.css
  - apps/dashboard/client/src/main.tsx
  - apps/dashboard/client/src/lib/api.ts
  - apps/dashboard/client/src/components/AuthGate.tsx
  - apps/dashboard/client/src/components/SetupWizard.tsx
  - apps/dashboard/client/src/components/SetupStepOpenRouter.tsx
  - apps/dashboard/client/src/components/SetupStepGitHub.tsx
  - apps/dashboard/client/src/components/DashboardLayout.tsx
  - apps/dashboard/client/src/components/SidebarChat.tsx
  - apps/dashboard/client/src/components/OverviewTab.tsx
  - apps/dashboard/client/src/hooks/useSetupState.ts
  - apps/dashboard/client/src/hooks/useChat.ts
  - apps/dashboard/client/package.json
autonomous: true
requirements: []

must_haves:
  truths:
    - "User sees login screen on first visit, enters DASHBOARD_TOKEN to authenticate"
    - "After login, if setup incomplete, user enters 2-step setup wizard (OpenRouter key, then GitHub OAuth)"
    - "After setup complete, user sees dashboard with a sidebar chat panel"
    - "Agent starts in OFF state (kill switch active) on first boot with no active goals"
    - "Only essential tools are registered: shell, http, file, db, multi-agent (3), bootstrap (2), self-extension (3) — NO wallet, browser, or identity tools"
    - "A seed goal exists in the DB describing the agent's self-evolution mission, but is not activated until user enables the agent"
  artifacts:
    - path: "apps/dashboard/src/routes/setup.ts"
      provides: "Setup wizard backend — GET/POST /api/setup for state + key storage"
    - path: "apps/dashboard/src/routes/chat.ts"
      provides: "Chat relay endpoint — POST /api/chat sends message to agent, returns response"
    - path: "apps/dashboard/client/src/components/SetupWizard.tsx"
      provides: "2-step wizard UI component"
    - path: "apps/dashboard/client/src/components/SidebarChat.tsx"
      provides: "Persistent sidebar chat panel"
    - path: "apps/dashboard/client/src/components/DashboardLayout.tsx"
      provides: "Main layout with sidebar chat + content area"
    - path: "packages/db/src/schema/setup-state.ts"
      provides: "Setup completion tracking in Postgres"
  key_links:
    - from: "apps/dashboard/client/src/App.tsx"
      to: "apps/dashboard/client/src/components/SetupWizard.tsx"
      via: "Conditional render based on setup state"
      pattern: "setupComplete.*SetupWizard|DashboardLayout"
    - from: "apps/dashboard/client/src/components/SidebarChat.tsx"
      to: "apps/dashboard/src/routes/chat.ts"
      via: "POST /api/chat"
      pattern: "fetch.*api/chat"
    - from: "apps/agent/src/index.ts"
      to: "packages/tools/src/index.ts"
      via: "Stripped tool registration — no wallet/browser/identity imports"
      pattern: "createDefaultRegistry.*createBootstrapTools.*createSelfExtensionTools"
---

<objective>
Restructure the Jarvis app to follow the required flow: Login -> Setup Wizard -> Dashboard with Sidebar Chat. Strip the agent down to essential self-building tools only, ensure it starts OFF, and seed it with a self-evolution goal.

Purpose: Transform the v1.0 "observe-only dashboard" into the proper app flow where the operator sets up the agent, the agent starts dormant, and the operator can interact via sidebar chat. Remove all domain-specific tools (wallet, browser, identity) so the agent is a blank slate that builds what it needs.

Output: Working app flow from login through setup to dashboard, with a stripped-down agent that starts OFF.
</objective>

<execution_context>
@/Users/sn0w/.claude/get-shit-done/workflows/execute-plan.md
@/Users/sn0w/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@apps/dashboard/src/app.ts
@apps/dashboard/src/index.ts
@apps/dashboard/src/middleware/auth.ts
@apps/dashboard/src/routes/api.ts
@apps/dashboard/src/routes/status.ts
@apps/dashboard/src/routes/kill-switch.ts
@apps/agent/src/index.ts
@packages/tools/src/index.ts
@packages/tools/src/registry.ts
@packages/db/src/schema/index.ts
@packages/db/src/schema/agent-state.ts
@packages/db/src/schema/goals.ts
@apps/dashboard/client/src/App.tsx
@apps/dashboard/client/src/App.css
@apps/dashboard/client/src/main.tsx
@apps/dashboard/client/src/lib/api.ts
@apps/dashboard/client/src/components/AuthGate.tsx
@apps/dashboard/client/src/components/OverviewTab.tsx
@apps/dashboard/client/src/hooks/useAgentData.ts
@apps/dashboard/client/src/hooks/useSSE.ts
@apps/dashboard/client/vite.config.ts
@apps/dashboard/client/package.json
@apps/dashboard/package.json
@packages/tools/src/self-extension/index.ts
@packages/tools/src/bootstrap/index.ts
@packages/tools/src/self-extension/staging-deployer.ts
@docker-compose.yml
</context>

<tasks>

<task type="auto">
  <name>Task 1: Backend — Setup state, setup routes, chat endpoint, and stripped agent startup</name>
  <files>
    packages/db/src/schema/setup-state.ts
    packages/db/src/schema/index.ts
    packages/db/src/index.ts
    apps/dashboard/src/routes/setup.ts
    apps/dashboard/src/routes/chat.ts
    apps/dashboard/src/app.ts
    apps/dashboard/src/middleware/auth.ts
    apps/agent/src/index.ts
  </files>
  <action>
**1. Create setup state DB schema** (`packages/db/src/schema/setup-state.ts`):
- Create a `setup_state` table using the existing `agentState` KV pattern (no new table needed — use agentState with key `setup:state`). Actually, create a dedicated typed table for clarity:
  ```
  setupState: pgTable('setup_state', {
    id: integer primary key generated always as identity,
    openrouterKeySet: boolean default false,
    githubConnected: boolean default false,
    githubUsername: varchar(256) nullable,
    setupCompletedAt: timestamp nullable,
    createdAt: timestamp defaultNow,
    updatedAt: timestamp defaultNow,
  })
  ```
- Export from `packages/db/src/schema/index.ts` and re-export from `packages/db/src/index.ts`.

**2. Create setup routes** (`apps/dashboard/src/routes/setup.ts`):
- `GET /api/setup` — returns current setup state. If no row exists, returns `{ openrouterKeySet: false, githubConnected: false, complete: false }`. Auth required (behind existing bearer middleware).
- `POST /api/setup/openrouter` — accepts `{ apiKey: string }`. Validates the key by making a test request to `https://openrouter.ai/api/v1/models` with `Authorization: Bearer {key}`. If valid (200 response), store the key in `agentState` with key `config:openrouter_api_key` (encrypted at rest if CREDENTIAL_ENCRYPTION_KEY is set, otherwise plaintext — matching existing credential patterns). Update setupState row `openrouterKeySet = true`. Return `{ success: true }`. If invalid, return 400 with `{ error: 'Invalid API key' }`.
- `POST /api/setup/github` — accepts `{ code: string }` (OAuth authorization code). For now, implement as a **stub** that stores a placeholder: set `githubConnected = true` and `githubUsername = 'pending-oauth'` in setupState. Return `{ success: true, username: 'pending-oauth' }`. Add a `// TODO: Exchange code for access token via GitHub OAuth App` comment. The real OAuth exchange requires a GitHub OAuth App client_id/secret which the user hasn't configured yet — stubbing this is the right call so the flow works end-to-end. The setup wizard UI will show a "Connect GitHub" button that for now just marks GitHub as connected (skip button).
- `GET /api/setup/github/callback` — placeholder route that returns `{ message: 'GitHub OAuth callback — not yet implemented' }`.

**3. Create chat relay endpoint** (`apps/dashboard/src/routes/chat.ts`):
- `POST /api/chat` — accepts `{ message: string }`. This endpoint provides the sidebar chat. For the initial implementation, it should:
  - Store the message in `agentState` with key `chat:latest_message` (simple storage for now)
  - Return `{ reply: "I'm currently in setup mode. Once activated, I'll be able to respond to your messages.", timestamp: new Date().toISOString() }`
  - Add a `// TODO: Wire to actual agent LLM call when agent is active` comment
  - This stub is correct because the agent starts OFF — real chat requires the agent loop to be running. The important thing is the UI works and messages flow.
- `GET /api/chat/history` — returns last 50 chat messages from `agentState` key `chat:history` (array of `{ role: 'user' | 'assistant', content: string, timestamp: string }`). If no history exists, return empty array.

**4. Mount new routes** (`apps/dashboard/src/app.ts`):
- Import setupRoute from `./routes/setup.js` and chatRoute from `./routes/chat.js`
- Mount: `app.route('/api/setup', setupRoute)` and `app.route('/api/chat', chatRoute)`
- Keep all existing routes mounted (status, kill-switch, activity, pnl, sse, identities, api)

**5. Modify auth middleware** (`apps/dashboard/src/middleware/auth.ts`):
- No changes needed — setup routes are under `/api/*` so they already require bearer auth. This is correct: the operator must be authenticated before configuring the system.

**6. Strip agent startup** (`apps/agent/src/index.ts`):
- **Remove** all imports and registration of: wallet tools (`createWalletTools`, `SignerClient`, `subscribeToWallet`), browser tools (`createBrowserTools`, `BrowserManager`), identity tools (`createIdentityTools`).
- **Remove** the entire Phase 4 wallet section (signer co-process, SignerClient, wallet tool registration, wallet subscription).
- **Remove** the entire Phase 6 browser and identity registration sections (keep bootstrap tool registration).
- **Remove** the `CREDENTIAL_ENCRYPTION_KEY` warning.
- **Keep**: default registry (shell, http, file, db), sub-agent tools (spawn, await, cancel), bootstrap tools (package_install, tool_discover), self-extension tools (tool_write, tool_delete, schema_extend), persisted tools loading, memory consolidation, kill switch, AI router, credit monitor, supervisor, agent worker, crash recovery, shutdown handlers.
- **Add** at startup (before supervisor.startSupervisorLoop): Check if kill switch is already active. If NOT active AND no goals exist in DB, activate the kill switch with reason `"Initial setup — agent starts in OFF state"` and source `"system"`. This ensures first boot = OFF state. Use `activateKillSwitch(db, reason, source)` from `@jarvis/ai`.
- **Add** seed goal insertion: After kill switch check, if goals table is empty (no rows), insert a seed goal:
  ```
  description: "Bootstrap self-evolution capabilities. You are a self-improving autonomous agent. Your mission: (1) Analyze what tools and integrations you currently have, (2) Identify what you need to build to become more capable, (3) Use your self-extension tools (tool_write, schema_extend, package_install) to build new capabilities, (4) Use GitHub integration for safe code changes via branches. Start by understanding your environment and planning your first capability expansion."
  source: 'system-seed'
  status: 'paused'
  priority: 10
  pauseReason: 'Awaiting operator activation after setup completion'
  ```
  This goal exists but is paused — the supervisor won't spawn a loop for it. When the operator resumes the agent (deactivates kill switch), they can also unpause this goal to kick things off.
- **Update** the shutdown handler to remove references to `signerProcess`, `walletSubscription`, and `browserManager` since those are no longer created. Import types will need adjustment — remove `ShutdownBrowserManager` import, pass `undefined` for removed optional params or update the `registerShutdownHandlers` call to omit them.
- **Update** the `registerShutdownHandlers` call: Check what params it expects. Remove `signerProcess`, `walletSubscription`, `browserManager` from the call. If the function signature requires them, pass `undefined`. Better: check `apps/agent/src/shutdown.ts` to see if params are optional, and if not, make them optional.

**Important:** Do NOT modify `packages/tools/src/index.ts` or any tool source files. The tools still exist in the codebase — we just don't register them at agent startup. The agent can later decide to use them via `tool_discover` + `package_install` if it determines it needs browser/wallet/identity capabilities.
  </action>
  <verify>
- `cd /Users/sn0w/Documents/dev/jarvis && pnpm -r --filter @jarvis/db build` succeeds (schema compiles)
- `cd /Users/sn0w/Documents/dev/jarvis && pnpm -r --filter @jarvis/dashboard build` succeeds (new routes compile)
- `cd /Users/sn0w/Documents/dev/jarvis && pnpm -r --filter @jarvis/agent build` succeeds (stripped startup compiles)
- Grep confirms no `createWalletTools`, `createBrowserTools`, `createIdentityTools` in `apps/agent/src/index.ts`
- Grep confirms `createBootstrapTools` and `createSelfExtensionTools` ARE in `apps/agent/src/index.ts`
- `apps/dashboard/src/routes/setup.ts` exists and exports a Hono app
- `apps/dashboard/src/routes/chat.ts` exists and exports a Hono app
  </verify>
  <done>
- Backend has GET/POST /api/setup routes for wizard state management
- Backend has POST /api/chat + GET /api/chat/history for sidebar chat
- Agent startup registers only 12 essential tools (4 primitives + 3 multi-agent + 2 bootstrap + 3 self-extension)
- Agent activates kill switch on first boot (starts OFF)
- A paused seed goal exists describing the self-evolution mission
- All TypeScript compiles cleanly
  </done>
</task>

<task type="auto">
  <name>Task 2: Frontend — Login, Setup Wizard, Dashboard with Sidebar Chat</name>
  <files>
    apps/dashboard/client/src/App.tsx
    apps/dashboard/client/src/App.css
    apps/dashboard/client/src/lib/api.ts
    apps/dashboard/client/src/components/AuthGate.tsx
    apps/dashboard/client/src/components/SetupWizard.tsx
    apps/dashboard/client/src/components/SetupStepOpenRouter.tsx
    apps/dashboard/client/src/components/SetupStepGitHub.tsx
    apps/dashboard/client/src/components/DashboardLayout.tsx
    apps/dashboard/client/src/components/SidebarChat.tsx
    apps/dashboard/client/src/components/OverviewTab.tsx
    apps/dashboard/client/src/hooks/useSetupState.ts
    apps/dashboard/client/src/hooks/useChat.ts
    apps/dashboard/client/package.json
  </files>
  <action>
**App Flow (the core requirement):**
```
Login (AuthGate) -> Setup Wizard (if not complete) -> Dashboard with Sidebar Chat
```

**1. Add `react-router-dom`** to `apps/dashboard/client/package.json` dependencies:
- `"react-router-dom": "^6.28.0"` — needed for clean route transitions between setup and dashboard. Actually, given this is a simple 3-state flow (login -> setup -> dashboard), DO NOT add react-router. Use conditional rendering based on auth + setup state. Simpler, fewer deps, matches existing pattern (AuthGate already does this).

**2. Create useSetupState hook** (`apps/dashboard/client/src/hooks/useSetupState.ts`):
- Uses TanStack Query to fetch `GET /api/setup` (via `apiJson`)
- Returns `{ data: SetupState, isLoading, refetch }`
- Type: `SetupState = { openrouterKeySet: boolean; githubConnected: boolean; complete: boolean }`
- `complete` is `true` when both `openrouterKeySet` and `githubConnected` are true

**3. Create useChat hook** (`apps/dashboard/client/src/hooks/useChat.ts`):
- Manages chat state: `messages: ChatMessage[]`, `sendMessage(text: string)`, `isLoading`
- Type: `ChatMessage = { role: 'user' | 'assistant'; content: string; timestamp: string }`
- On mount, fetch `GET /api/chat/history` to load existing messages
- `sendMessage`: POST to `/api/chat` with `{ message }`, append user message immediately (optimistic), then append assistant reply from response
- Uses TanStack Query mutation for sends, query for history

**4. Create SetupStepOpenRouter** (`apps/dashboard/client/src/components/SetupStepOpenRouter.tsx`):
- Step 1 of 2. Shows:
  - Title: "Connect OpenRouter"
  - Subtitle: "Your AI backbone. Enter your OpenRouter API key to give the agent access to language models."
  - A password input field for the API key
  - A "Validate & Save" button that POSTs to `/api/setup/openrouter`
  - Loading state while validating
  - Error display if key is invalid
  - On success, calls `onComplete()` prop to advance wizard
- Inline styles following the existing pattern from AuthGate.tsx (dark primary buttons, clean card aesthetic)
- Link text: "Get a key at openrouter.ai" pointing to `https://openrouter.ai/keys`

**5. Create SetupStepGitHub** (`apps/dashboard/client/src/components/SetupStepGitHub.tsx`):
- Step 2 of 2. Shows:
  - Title: "Connect GitHub"
  - Subtitle: "For safe self-evolution. The agent uses GitHub branches and PRs to modify its own code without breaking things."
  - A "Connect GitHub Account" button — for now, since OAuth isn't fully wired, this button POSTs to `/api/setup/github` with `{ code: 'manual-setup' }` to mark GitHub as connected
  - A "Skip for Now" link/button that also marks GitHub as connected (since it's stubbed anyway, both paths do the same thing — but the UI distinction matters for when OAuth is real)
  - On success, calls `onComplete()` prop
- Style: same card aesthetic

**6. Create SetupWizard** (`apps/dashboard/client/src/components/SetupWizard.tsx`):
- Manages wizard state: `currentStep: 1 | 2`
- Renders a centered card (like AuthGate) with step indicator ("Step 1 of 2" / "Step 2 of 2")
- Step 1: `<SetupStepOpenRouter onComplete={() => setCurrentStep(2)} />`
- Step 2: `<SetupStepGitHub onComplete={() => onSetupComplete()} />`
- Props: `onSetupComplete: () => void` — called when both steps done
- If `setupState.openrouterKeySet` is already true on mount, skip to step 2
- If both are already true, immediately call `onSetupComplete`
- Progress indicator: two small dots/circles at top of card, filled for completed steps

**7. Create SidebarChat** (`apps/dashboard/client/src/components/SidebarChat.tsx`):
- Fixed-width sidebar (320px) on the right side of the dashboard
- Components:
  - Header: "Agent Chat" title
  - Message list: scrollable area showing chat history. User messages right-aligned (dark bg), assistant messages left-aligned (light bg). Each message shows timestamp.
  - Input area: text input + send button at bottom. Enter key sends. Disabled while loading.
- Uses the `useChat` hook
- Auto-scrolls to bottom on new messages
- Minimal clean styling matching dashboard aesthetic (use CSS classes, add to App.css)

**8. Create DashboardLayout** (`apps/dashboard/client/src/components/DashboardLayout.tsx`):
- Flex container: main content area (flex: 1) + SidebarChat (320px fixed)
- Main content renders the existing tab-based dashboard (OverviewTab, ActivityTab)
- Full viewport height (`min-height: 100vh`)
- Props: `children: ReactNode` for the main content area
- Structure:
  ```tsx
  <div className="dashboard-layout">
    <main className="dashboard-main">
      {children}
    </main>
    <aside className="dashboard-sidebar">
      <SidebarChat />
    </aside>
  </div>
  ```

**9. Update App.tsx** — The core flow orchestration:
- After auth (token exists), check setup state via `useSetupState`
- If loading: show "Loading..." spinner
- If `!setupState.complete`: render `<SetupWizard onSetupComplete={() => refetchSetup()} />`
- If `setupState.complete`: render `<DashboardLayout><Dashboard /></DashboardLayout>` (where Dashboard is the existing tab content)
- The flow is: `AuthGate` -> check setup -> `SetupWizard` OR `DashboardLayout`

**10. Update App.css** — Add styles for new components:
- `.dashboard-layout` — flex container, full height
- `.dashboard-main` — flex: 1, overflow auto, existing dashboard padding
- `.dashboard-sidebar` — 320px wide, border-left, flex column, full height
- `.sidebar-chat` — flex column full height
- `.chat-messages` — flex: 1, overflow-y auto, padding
- `.chat-message` — message bubble styles (user vs assistant)
- `.chat-input-area` — bottom input bar
- `.wizard-card` — centered setup card (reuse AuthGate card pattern)
- `.wizard-progress` — step indicator dots
- `.wizard-step-title` — step title styling
- Keep ALL existing styles (append new ones at the end of the file)

**11. Minor update to OverviewTab** — Keep as-is. The existing overview works inside the new layout. No changes needed.

**12. NO changes to `main.tsx`** — QueryClientProvider wrapping is already correct.

**Styling guidelines:**
- Match the existing Linear/Vercel aesthetic in App.css (dark text, white cards, subtle borders, system font)
- Use CSS classes in App.css, not inline styles, for new components (the existing AuthGate uses inline styles but new components should use CSS classes for consistency with the rest of the dashboard)
- Mobile: sidebar collapses below main content on screens < 768px
  </action>
  <verify>
- `cd /Users/sn0w/Documents/dev/jarvis/apps/dashboard/client && npx tsc --noEmit` passes (all TSX compiles)
- `cd /Users/sn0w/Documents/dev/jarvis/apps/dashboard/client && npx vite build` succeeds (bundle builds)
- All new component files exist: SetupWizard.tsx, SetupStepOpenRouter.tsx, SetupStepGitHub.tsx, DashboardLayout.tsx, SidebarChat.tsx
- All new hook files exist: useSetupState.ts, useChat.ts
- App.tsx imports and uses SetupWizard and DashboardLayout
- App.css contains `.dashboard-layout`, `.dashboard-sidebar`, `.sidebar-chat`, `.chat-messages` classes
  </verify>
  <done>
- Login screen appears on first visit (existing AuthGate, unchanged)
- After login, setup wizard shows if setup incomplete (Step 1: OpenRouter key, Step 2: GitHub)
- After setup complete, dashboard loads with sidebar chat panel on the right
- Chat panel shows message history and allows sending messages
- All existing dashboard functionality (overview, activity, kill switch) preserved inside new layout
- Frontend builds and bundles successfully
  </done>
</task>

<task type="auto">
  <name>Task 3: Build, verify full flow, and update compiled SPA bundle</name>
  <files>
    apps/dashboard/public/index.html
    apps/dashboard/public/assets/
  </files>
  <action>
**1. Build the full project:**
- Run `cd /Users/sn0w/Documents/dev/jarvis && pnpm -r build` to build all packages
- If there are TypeScript errors, fix them in the relevant files from Tasks 1 and 2

**2. Build the client SPA:**
- Run `cd /Users/sn0w/Documents/dev/jarvis/apps/dashboard/client && npx vite build`
- This outputs to `apps/dashboard/public/` (configured in vite.config.ts `outDir: '../public'`)
- Verify `apps/dashboard/public/index.html` exists and references the new JS/CSS bundles

**3. Verify the compiled bundle:**
- Check that `apps/dashboard/public/assets/` contains the new `.js` and `.css` files
- The old `index-BNEAaLfe.js` and `index-D3qdhyOz.css` should be replaced by Vite's new hashed filenames

**4. Verify agent startup compiles and runs (dry run):**
- `cd /Users/sn0w/Documents/dev/jarvis && pnpm -r --filter @jarvis/agent build` must succeed
- Verify the built output doesn't reference wallet/browser/identity imports

**5. Sanity check the shutdown handler:**
- Read `apps/agent/src/shutdown.ts` and verify the updated `registerShutdownHandlers` call from Task 1 is compatible. If the function signature has required params for browser/wallet resources, those params must be made optional or given `undefined` defaults in the shutdown.ts types. Fix if needed.

**6. Final verification checklist:**
- `grep -r "createWalletTools\|createBrowserTools\|createIdentityTools" apps/agent/src/index.ts` returns nothing
- `grep -r "createBootstrapTools\|createSelfExtensionTools" apps/agent/src/index.ts` returns matches
- `apps/dashboard/src/routes/setup.ts` exports a Hono route
- `apps/dashboard/src/routes/chat.ts` exports a Hono route
- `apps/dashboard/client/src/components/SetupWizard.tsx` exists
- `apps/dashboard/client/src/components/SidebarChat.tsx` exists
- All builds pass
  </action>
  <verify>
- `pnpm -r build` exits 0
- `ls apps/dashboard/public/assets/*.js` shows compiled bundle
- `ls apps/dashboard/public/index.html` exists
- No TypeScript errors in any package
  </verify>
  <done>
- Full monorepo builds cleanly
- SPA bundle is compiled and ready to serve from dashboard
- Agent startup is stripped to 12 essential tools
- Complete app flow: Login -> Setup Wizard -> Dashboard with Sidebar Chat
- Agent starts OFF with a paused seed goal
  </done>
</task>

</tasks>

<verification>
1. Full monorepo build: `pnpm -r build` succeeds with no errors
2. Client SPA build: `vite build` produces updated bundle in `apps/dashboard/public/`
3. Agent starts with only essential tools (12 total, no wallet/browser/identity)
4. Agent activates kill switch on first boot (starts OFF)
5. Seed goal exists in paused state
6. Dashboard routes exist: GET/POST /api/setup, POST /api/chat, GET /api/chat/history
7. Frontend flow: AuthGate -> SetupWizard (conditional) -> DashboardLayout with SidebarChat
</verification>

<success_criteria>
- The app follows the specified flow: Login -> Setup Wizard (OpenRouter + GitHub) -> Dashboard with Sidebar Chat
- Agent registers only primitive + self-building tools (no domain-specific wallet/browser/identity tools)
- Agent starts in OFF state (kill switch active) with a paused seed goal
- Everything compiles and the SPA bundle is updated
- Existing dashboard functionality (overview, activity, kill switch) is preserved within the new layout
</success_criteria>

<output>
After completion, create `.planning/quick/1-ensure-app-follows-login-setup-wizard-da/1-SUMMARY.md`
</output>
