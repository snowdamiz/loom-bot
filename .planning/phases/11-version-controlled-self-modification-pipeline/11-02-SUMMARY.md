---
phase: 11-version-controlled-self-modification-pipeline
plan: 02
subsystem: self-extension
tags: [github-pipeline, deterministic-branching, commit-metadata, pr-upsert, sandbox-status]
requires:
  - phase: 11-01
    provides: execution context propagation, deterministic branch naming, commit metadata envelope
provides:
  - trusted GitHub pipeline orchestration for deterministic branch + commit + PR upsert
  - builtinModify delegation to repository pipeline with PR-backed response payloads
  - sandbox evidence publication and commit status context updates
affects: [phase-11-03, builtin-modify, self-extension-audit]
tech-stack:
  added: []
  patterns:
    - fail-closed trusted GitHub context loading with encrypted token resolution
    - deterministic branch identity plus idempotent PR upsert by branch head
key-files:
  created:
    - packages/tools/src/self-extension/github-pipeline.ts
    - .planning/phases/11-version-controlled-self-modification-pipeline/11-02-SUMMARY.md
  modified:
    - packages/tools/src/self-extension/github-trust-guard.ts
    - packages/tools/src/self-extension/index.ts
    - packages/tools/src/self-extension/staging-deployer.ts
    - packages/tools/src/self-extension/tool-writer.ts
key-decisions:
  - "Trusted GitHub context retrieval now includes encrypted oauth token decryption in tools package, not only setup routes, so self-extension can execute fail-closed GitHub API calls."
  - "Builtin modify flow now validates compile+sandbox before repository promotion operations, then records candidate state through branch/commit/PR/status surfaces."
  - "PR lifecycle is idempotent by deterministic branch identity (update existing open PR, create only when absent)."
patterns-established:
  - "Commit metadata trailers use `Jarvis-Meta` payload generated from execution context helper."
  - "Sandbox evidence is summarized in PR body and mirrored into `jarvis/sandbox` commit status context."
requirements-completed: [SEXT-05, SEXT-06, SEXT-07]
duration: 3 min
completed: 2026-02-19
---

# Phase 11 Plan 02: GitHub branch/commit/PR upsert pipeline with sandbox evidence status Summary

**Builtin self-modification now runs through a trusted GitHub repository pipeline with deterministic branching, metadata commits, PR upsert, and explicit sandbox status publication.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-19T23:15:49Z
- **Completed:** 2026-02-19T23:18:16Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Added reusable trusted GitHub context resolver that validates setup trust prerequisites and decrypts active OAuth token for repository API calls.
- Added `runGitHubSelfExtensionPipeline` orchestration for deterministic branch handling (`refs/heads/*`), metadata commits, PR upsert, evidence body updates, and commit status publication.
- Replaced local git staging in builtin modify path with pipeline delegation while preserving compile/sandbox-first ordering.
- Updated builtin `tool_write` responses to return PR-backed diagnostics (`branchName`, `headSha`, `pullRequestUrl`, `pullRequestNumber`, `evidenceStatusContext`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Add trusted GitHub pipeline orchestration module for branch and commit creation** - `f76e669` (feat)
2. **Task 2: Integrate repository pipeline into staging-deployer and tool_write builtin path** - `edb9268` (feat)
3. **Task 3: Implement PR upsert and sandbox evidence/status publication** - `af17a60` (feat)

**Plan metadata:** pending (created after state/roadmap updates)

## Files Created/Modified
- `packages/tools/src/self-extension/github-trust-guard.ts` - Added trusted GitHub context resolver with encrypted token retrieval.
- `packages/tools/src/self-extension/github-pipeline.ts` - Added deterministic branch/commit orchestration, PR upsert, evidence body generation, and status updates.
- `packages/tools/src/self-extension/staging-deployer.ts` - Delegated builtin modification flow to GitHub pipeline after compile+sandbox checks.
- `packages/tools/src/self-extension/tool-writer.ts` - Updated builtin modify path to return PR-backed payload fields and evidence context.
- `packages/tools/src/self-extension/index.ts` - Exported pipeline entrypoint and trusted context helper.

## Decisions Made
- Self-extension GitHub token retrieval is centralized in trust guard module to keep one fail-closed authority for repo pipeline access.
- Deterministic branch identity is now the key for PR upsert behavior.
- Sandbox outcomes are reflected both in PR content and commit status context (`jarvis/sandbox`).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- End-to-end live GitHub API smoke execution (real builtinModify invocation against a bound sandbox repo) was not executed in this environment because setup credentials/repo binding are environment-dependent.

## User Setup Required

None.

## Next Phase Readiness
- Branch/commit/PR/status surfaces are now in place for builtin modifications.
- Ready for Plan 11-03 promotion gate enforcement (status-based merge blocking and cleanup behavior).

---
*Phase: 11-version-controlled-self-modification-pipeline*
*Completed: 2026-02-19*
