---
phase: 08-self-extension-and-agent-economics
plan: "03"
subsystem: self-extension
tags: [tool-write, tool-delete, git-staging, esbuild, sandbox, simple-git, zod]

# Dependency graph
requires:
  - phase: 08-01
    provides: compileTypeScript, runInSandbox, loadPersistedTools, AGENT_TOOLS_DIR
  - phase: 08-02
    provides: createSchemaExtendTool for barrel inclusion in createSelfExtensionTools
provides:
  - createToolWriteTool factory — tool_write ToolDefinition (compile, sandbox test, persist, register agent-authored tools)
  - createToolDeleteTool factory — tool_delete ToolDefinition (unregister and remove agent-authored tools)
  - stageBuiltinChange — git branch staging for safe built-in tool modifications
  - createSelfExtensionTools(registry) — convenience factory returning all 3 self-extension tools
  - loadPersistedTools and AGENT_TOOLS_DIR re-exported from @jarvis/tools barrel
affects:
  - apps/agent (startup wiring: call createSelfExtensionTools, call loadPersistedTools)
  - 08-04 (economics tools may reference tool_write for self-extension patterns)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Factory pattern for ToolDefinition creation with registry injection (createToolWriteTool/createToolDeleteTool receive ToolRegistry by reference)
    - Built-in tool name set captured at factory creation time — differentiates built-in vs agent-authored tools
    - Git branch staging for safe modification of built-in tools (branch, commit, test, merge/abandon)
    - Cache-busting dynamic import with ?v=Date.now() for hot-swap after tool registration
    - Named import for simple-git ({ simpleGit }) — TypeScript ESM requires named import not default call

key-files:
  created:
    - packages/tools/src/self-extension/staging-deployer.ts
    - packages/tools/src/self-extension/tool-writer.ts
    - packages/tools/src/self-extension/index.ts
  modified:
    - packages/tools/src/index.ts

key-decisions:
  - "simple-git named import { simpleGit } required — default call import causes TS2349 no-call-signatures error under NodeNext moduleResolution"
  - "createToolWriteTool/createToolDeleteTool capture built-in tool names at factory creation time (not at execute time) — set is stable across invocations"
  - "originalBranch initialized to 'main' string (not null) — avoids TS18047 possibly null error; overwritten immediately from git.revparse before use"
  - "StatusResultRenamed explicit type annotation on .map() callbacks — fixes TS7006 implicit any error on renamed array elements"

patterns-established:
  - "Tool factory functions (createXTool) take registry by reference and capture initial state at creation time"
  - "Built-in modification gate: builtinToolNames Set checked at execute() entry, not at registration time"
  - "Self-extension barrel: createSelfExtensionTools(registry) is the primary entry point for phase 8 tools"

requirements-completed: [EXTEND-01, EXTEND-02, EXTEND-03, EXTEND-05, AGENT-01, AGENT-02, AGENT-03, AGENT-04]

# Metrics
duration: 2min
completed: 2026-02-19
---

# Phase 8 Plan 03: Tool Write, Tool Delete, and Self-Extension Barrel Summary

**tool_write and tool_delete ToolDefinitions with git-branch-staged built-in modification, plus createSelfExtensionTools factory exporting all 3 Phase 8 tools via @jarvis/tools barrel**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-19T05:48:34Z
- **Completed:** 2026-02-19T05:50:47Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- `tool_write` ToolDefinition: compiles TypeScript via esbuild, sandbox tests in isolated forked process, persists `.ts` + `.mjs` to `agent-tools/`, and hot-swaps into the live registry for immediate use
- `tool_delete` ToolDefinition: unregisters from registry and removes both source files from disk; blocks deletion of built-in tools
- `stageBuiltinChange`: full git branch staging workflow for safe built-in tool modifications — branch, commit, sandbox test, merge with `--ff-only` on success or force-delete on failure
- `createSelfExtensionTools(registry)` factory returns all 3 Phase 8 tools (tool_write, tool_delete, schema_extend)
- `@jarvis/tools` barrel updated with `createSelfExtensionTools`, `loadPersistedTools`, `AGENT_TOOLS_DIR`

## Task Commits

Each task was committed atomically:

1. **Task 1: tool_write and tool_delete ToolDefinitions + staging deployer** - `9276f2a` (feat)
2. **Task 2: Self-extension barrel exports and @jarvis/tools integration** - `8b5de0b` (feat)

**Plan metadata:** `(pending)` (docs: complete plan)

## Files Created/Modified
- `packages/tools/src/self-extension/staging-deployer.ts` — stageBuiltinChange: git branch staging for built-in tool modifications
- `packages/tools/src/self-extension/tool-writer.ts` — createToolWriteTool and createToolDeleteTool factories
- `packages/tools/src/self-extension/index.ts` — createSelfExtensionTools factory barrel + named exports for all self-extension internals
- `packages/tools/src/index.ts` — added createSelfExtensionTools, loadPersistedTools, AGENT_TOOLS_DIR to @jarvis/tools public API

## Decisions Made
- `{ simpleGit }` named import required — TypeScript NodeNext moduleResolution does not recognize default export as callable function (TS2349 no-call-signatures)
- Built-in tool names captured at factory creation time as a `Set<string>` snapshot — consistent across all tool_write/tool_delete invocations within the same process lifetime
- `originalBranch` initialized to `'main'` string (not null) to avoid TS18047; immediately overwritten from `git.revparse(['--abbrev-ref', 'HEAD'])` before any staging operations
- `StatusResultRenamed` explicitly typed in `.map()` callbacks to fix TS7006 implicit any on the `renamed` array elements

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed simple-git default import causing TS2349 no-call-signatures**
- **Found during:** Task 1 (initial build after creating staging-deployer.ts)
- **Issue:** Plan specified `import simpleGit from 'simple-git'` but simple-git v3 under TypeScript NodeNext moduleResolution only exposes a named `simpleGit` export, not a callable default; TypeScript error TS2349
- **Fix:** Changed to `import { simpleGit } from 'simple-git'` and added `import type { StatusResultRenamed } from 'simple-git'`; fixed `originalBranch` nullability by using string init instead of null
- **Files modified:** `packages/tools/src/self-extension/staging-deployer.ts`
- **Verification:** `pnpm build --filter @jarvis/tools` passes after fix
- **Committed in:** 9276f2a (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** Required to compile. No scope creep — purely a TypeScript import style fix.

## Issues Encountered
- TypeScript strict mode with NodeNext moduleResolution required named imports for simple-git, explicit type annotations for StatusResultRenamed, and non-null string initialization for originalBranch

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- tool_write, tool_delete, schema_extend, and createSelfExtensionTools are ready for apps/agent wiring in plan 08-04
- Agent startup needs: `const selfExtTools = createSelfExtensionTools(registry); selfExtTools.forEach(t => registry.register(t));` plus `loadPersistedTools(registry)` for persisted agent-authored tools
- Full workspace build passes (`pnpm build` — 10/10 tasks successful)

## Self-Check: PASSED

All files present. All commits verified.

---
*Phase: 08-self-extension-and-agent-economics*
*Completed: 2026-02-19*
