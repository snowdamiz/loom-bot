---
phase: quick
plan: 2
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/agent/src/index.ts
autonomous: true
requirements: []
---

<objective>
Re-add browser tools (8 tools) to the agent startup. They were removed in quick task 1 but should remain as essential tools. The agent needs browser automation to interact with the web.

The BrowserManager from @jarvis/browser must be instantiated, browser tools created via createBrowserTools(), registered in the registry, and the browserManager passed to the shutdown handler for cleanup.
</objective>

<execution_context>
@/Users/sn0w/.claude/get-shit-done/workflows/execute-plan.md
@/Users/sn0w/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/agent/src/index.ts
@apps/agent/src/shutdown.ts
@packages/tools/src/browser/index.ts
@packages/browser/src/index.ts
@packages/tools/src/index.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Re-add BrowserManager and browser tools to agent startup</name>
  <files>
    apps/agent/src/index.ts
  </files>
  <action>
**1. Add imports** to `apps/agent/src/index.ts`:
- Add `createBrowserTools` to the `@jarvis/tools` import: `import { createDefaultRegistry, redis, createBootstrapTools, createSelfExtensionTools, loadPersistedTools, createBrowserTools } from '@jarvis/tools';`
- Add `BrowserManager` import: `import { BrowserManager } from '@jarvis/browser';`

**2. Create BrowserManager instance** in the `main()` function.
After the registry is created (line 48) and before the queue setup, add:
```typescript
// Browser automation — BrowserManager manages Chromium lifecycle
const browserManager = new BrowserManager();
```

**3. Register browser tools** after the self-extension tools block (after line 161), add:
```typescript
// Register browser tools (8 tools: session open/close/save, navigate, click, fill, extract, screenshot)
const browserTools = createBrowserTools(browserManager);
browserTools.forEach((t) => registry.register(t));
```

**4. Update the shutdown handler call** to include `browserManager`:
Change the `registerShutdownHandlers` call to include `browserManager`:
```typescript
registerShutdownHandlers({
  pool,
  redis,
  consolidation,
  supervisor,
  agentWorker,
  agentTasksQueue,
  reloadToolsQueue,
  creditMonitor,
  browserManager,  // <-- add this
});
```

**5. Update the startup comment** at the top of the file to reflect that browser tools are included:
- Update the tool count from 12 to 20
- Add browser tools to the registered tools list in the comment

**6. Update log messages** that reference tool counts to not hardcode "12 essential tools" — use dynamic registry.count() (which is already the case).
  </action>
  <verify>
- `cd /Users/sn0w/Documents/dev/jarvis && pnpm -r --filter @jarvis/agent build` succeeds
- `grep "createBrowserTools" apps/agent/src/index.ts` returns a match
- `grep "BrowserManager" apps/agent/src/index.ts` returns a match
- `grep "browserManager" apps/agent/src/index.ts` returns matches for creation, tools, and shutdown
  </verify>
  <done>
- BrowserManager instantiated at startup
- 8 browser tools registered in the tool registry
- browserManager passed to shutdown handler for proper Chromium cleanup
- Agent now has 20 tools: 4 primitives + 3 multi-agent + 2 bootstrap + 3 self-extension + 8 browser
  </done>
</task>

</tasks>

<verification>
1. `pnpm -r --filter @jarvis/agent build` succeeds
2. Browser tools appear in registry
3. browserManager in shutdown handler
</verification>

<success_criteria>
- Browser tools (8) are registered alongside all other essential tools at agent startup
- BrowserManager lifecycle managed properly (shutdown handler)
- Agent compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/2-re-add-browser-tools-to-agent-startup/2-SUMMARY.md`
</output>
