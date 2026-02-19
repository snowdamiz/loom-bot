# Phase 12: Isolated Sandbox Verification - Research

**Researched:** 2026-02-19
**Domain:** Repository-isolated candidate verification with bounded runtime and structured diagnostics
**Confidence:** HIGH-MEDIUM (current code and requirements are clear; exact smoke-test/test harness shape is still a product decision)

<user_constraints>
## User Constraints (from CONTEXT.md)

No `12-CONTEXT.md` exists yet, so this research uses roadmap + requirements + current Phase 11 implementation.

Planning assumptions used for this phase:
- Keep the existing TypeScript monorepo and current self-extension entry point (`tool_write` -> `stageBuiltinChange`).
- Keep GitHub-backed deterministic branch/PR flow from Phase 11.
- Add isolation, bounded execution, and diagnostics as a verification layer before promotion decisions.
- Prefer in-repo primitives already in use (`child_process`, `pnpm --filter`, existing compile/sandbox modules) before introducing heavy new infrastructure.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SEXT-09 | Candidate code must be tested in an isolated sandbox workspace, not directly against live running source files | Use ephemeral `git worktree` workspaces tied to candidate branch/head, apply change inside that workspace only, and run all verification commands from that isolated path. |
| SEXT-10 | Sandbox execution must enforce timeout and resource limits so failed tests cannot wedge the main agent loop | Wrap all verification stages in bounded subprocess execution (`timeout`, abort/kill behavior, memory caps, bounded output capture, and cleanup in `finally`). |
| SEXT-11 | Verification must include TypeScript compile, targeted tests, and startup smoke check | Define a deterministic stage contract: `compile` -> `targetedTests` -> `startupSmoke`, with package-scoped command routing from changed file paths. |
| SEXT-12 | Failed sandbox runs must return structured diagnostics that are logged and visible in operator tooling | Return a typed diagnostics envelope with stage-level status, timing, command metadata, bounded output excerpts, and normalized failure reasons for both tool responses and dashboard/operator views. |
</phase_requirements>

---

## Summary

Phase 11 established trusted GitHub branch/commit/PR promotion and status-gated merge, but verification is still limited to compiling a single TypeScript source string plus invoking `tool.execute()` in a forked process. That is useful for fast validation, but it does not yet verify candidate behavior in a repository-isolated workspace, does not run package-level compile/test/startup checks, and does not enforce explicit resource policies beyond timeout.

Phase 12 should add a dedicated verification subsystem that operates on an ephemeral isolated workspace, executes deterministic multi-stage checks (`compile`, `targetedTests`, `startupSmoke`), and emits machine-readable diagnostics. The existing `stageBuiltinChange` path should orchestrate this verifier and publish summarized evidence into the existing PR/status pipeline.

**Primary recommendation:** Add a reusable `self-extension/isolated-verifier` module that creates an ephemeral `git worktree`, runs bounded stage commands, returns structured diagnostics, and blocks promotion on any failed or incomplete required stage.

---

## Standard Stack

### Core

| Library/Capability | Version | Purpose | Why Standard |
|--------------------|---------|---------|--------------|
| Git worktree (`git worktree add/remove/prune`) | Git built-in | Create ephemeral candidate workspace isolated from live runtime files | Native Git mechanism for branch-linked isolated working trees without custom copy/sync logic |
| Node `child_process` (`spawn`, `fork`, `timeout`, `killSignal`, `signal`) | Node runtime | Execute compile/test/smoke commands with hard time bounds | Existing codebase already uses child-process orchestration and timeout-driven cancellation |
| Node runtime memory bounding (`--max-old-space-size`) | Node CLI | Bound heap usage of verification subprocesses | Practical memory cap at process level without new infra |
| Existing self-extension pipeline modules (`staging-deployer.ts`, `github-pipeline.ts`) | in-repo | Integrate verification outcomes with existing PR/status/promotion flow | Preserves current trusted promotion architecture and extends it safely |
| `pnpm --filter` package-scoped command execution | pnpm 9 | Run compile/tests only for affected workspaces | Fits monorepo structure and avoids full-repo verification cost on every candidate |

### Supporting

| Library/Capability | Version | Purpose | When to Use |
|--------------------|---------|---------|-------------|
| `process.resourceUsage()` and `process.memoryUsage()` | Node runtime | Collect structured resource diagnostics for failed/slow runs | Include in diagnostics payload for SEXT-12 observability |
| Existing `runInSandbox` quick execution | in-repo | Keep fast tool-execute check as a preflight stage | Use before heavier isolated workspace verification for early failures |
| Turborepo filtered task execution (`turbo run ... --filter`) | Turbo 2 | Optional coordinated compile/test command fan-out | Use when cross-package dependency checks are needed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `git worktree` isolation | Full directory copy/rsync to `/tmp` | Simpler to reason about initially, but expensive and easier to desync from candidate branch semantics |
| Process-level bounds (`timeout`, heap caps) | Containerized verifier (`docker run` with cgroup limits) | Stronger isolation, but introduces runtime dependency and environment coupling |
| Package-scoped verification | Full monorepo `pnpm build`/all-tests on every change | Stronger confidence but too slow/noisy for autonomous iteration loop |
| Stage-wise structured diagnostics object | Free-form combined text logs | Harder to classify/reason on failures and weak dashboard/operator UX |

**Installation:** none required for baseline Phase 12 implementation (all core primitives already exist in repo/runtime).

---

## Architecture Patterns

### Recommended Project Structure

```
packages/tools/src/self-extension/
├── isolated-verifier.ts          # Orchestrates isolated workspace verification stages
├── workspace-isolation.ts        # git worktree lifecycle + cleanup guards
├── bounded-command.ts            # spawn wrapper with timeout/resource/output limits
├── verification-diagnostics.ts   # Typed result schema + serialization helpers
├── staging-deployer.ts           # Calls isolated verifier before GitHub promotion path
└── github-pipeline.ts            # Consumes summarized verifier evidence (existing)
```

### Pattern 1: Ephemeral Worktree Isolation (SEXT-09)

**What:** run verification against a temporary branch-linked workspace that is not the live runtime tree.

**Flow:**
1. Resolve candidate branch/head context from existing pipeline inputs.
2. Create temp workspace path (for example: `/tmp/jarvis-sext/<runId>`).
3. `git worktree add --detach <path> <headSha>` (or deterministic branch ref).
4. Apply candidate content only inside the worktree.
5. Execute all verification commands with `cwd=<worktree>`.
6. Always clean up (`git worktree remove --force` + `git worktree prune`) in `finally`.

**Why:** avoids mutating or reading from the main runtime tree during candidate verification.

### Pattern 2: Deterministic Multi-Stage Verification Contract (SEXT-11)

**What:** enforce required stages with explicit pass/fail status.

**Required stage order:**
1. `compile` - package-scoped TypeScript compile for affected workspace(s)
2. `targetedTests` - tests mapped to changed module/package
3. `startupSmoke` - bounded startup-path smoke validation

**Startup smoke recommendation:** add an explicit smoke mode/entrypoint (for example `--startup-smoke`) that exercises boot wiring and exits quickly, so checks do not hang waiting for long-running loop dependencies.

**Gate rule:** promotion may proceed only when all required stages are `pass`.

### Pattern 3: Bounded Execution Envelope (SEXT-10)

**What:** every verifier subprocess executes inside explicit time/resource/output bounds.

**Minimum bounds to enforce:**
- per-stage timeout + overall verification deadline
- hard kill on timeout (`killSignal` then `SIGKILL` fallback)
- memory cap (`execArgv: ['--max-old-space-size=...']` for node stages)
- bounded stdout/stderr capture (tail + byte limit) to prevent memory bloat
- abort propagation so parent cancellation cleans up all children

**Fail-closed principle:** if a stage exits unknown/interrupted/timed-out, mark verification failed.

### Pattern 4: Structured Diagnostics Contract (SEXT-12)

**What:** return deterministic JSON diagnostics for machine + operator consumption.

**Recommended shape:**
```json
{
  "runId": "string",
  "overall": "pass|fail|error|timeout",
  "workspace": { "path": "...", "isolated": true },
  "timing": { "startedAt": "...", "endedAt": "...", "durationMs": 0 },
  "stages": [
    {
      "name": "compile|targetedTests|startupSmoke",
      "status": "pass|fail|timeout|error|skipped",
      "command": ["pnpm", "--filter", "@jarvis/tools", "build"],
      "cwd": "...",
      "exitCode": 0,
      "durationMs": 0,
      "stdoutTail": "...",
      "stderrTail": "...",
      "resource": { "maxRssBytes": 0, "cpuUserMicros": 0 }
    }
  ],
  "failure": {
    "category": "compile|test|startup|timeout|infra",
    "reason": "normalized reason",
    "stage": "compile"
  }
}
```

### Anti-Patterns to Avoid

- Running verification in the main repo checkout used by the live agent runtime.
- Treating timeout-only controls as sufficient resource policy (no memory/output bounds).
- Marking `targetedTests` as passed when no relevant test command exists (should be explicit fail or explicit policy-driven skip with rationale).
- Using startup smoke commands that can block indefinitely on DB/API readiness loops.
- Returning only raw logs with no structured failure category/stage metadata.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Workspace isolation | Manual copy/sync/cleanup shell glue | `git worktree` lifecycle | Built-in branch-aware isolation with less drift risk |
| Timeout semantics | Ad hoc timers per callsite | Shared bounded-command utility | One consistent policy surface for verifier stages |
| Memory control | Best-effort assumptions only | Node heap cap flags + bounded output buffers | Prevents verifier runs from exhausting agent process resources |
| Failure reporting | Free-form strings only | Typed diagnostics envelope | Required for autonomous reasoning + operator observability |
| Promotion decisioning | Stage-local booleans scattered in code | Single verifier summary consumed by staging/promotion gate | Deterministic, auditable pass/fail source of truth |

**Key insight:** Phase 12 is a verification-contract phase, not just a "run commands" phase. Deterministic stage semantics and diagnostics shape are as important as command execution itself.

---

## Common Pitfalls

### Pitfall 1: Worktree leaks and disk growth
**What goes wrong:** failed/interrupted runs leave stale worktrees and temp artifacts.
**Why it happens:** cleanup not in `finally`, no prune pass, or cleanup errors ignored.
**How to avoid:** centralized cleanup routine with best-effort retries and telemetry on cleanup failures.
**Warning signs:** `git worktree list` grows over time; `/tmp/jarvis-sext` accumulates stale dirs.

### Pitfall 2: False isolation
**What goes wrong:** verifier reads/writes files from live checkout due to wrong `cwd` or relative path resolution.
**Why it happens:** stage command builder does not enforce worktree root.
**How to avoid:** absolute worktree paths, explicit `cwd`, and assertion that resolved file targets are under workspace root.
**Warning signs:** modified files appear in primary checkout after verifier run.

### Pitfall 3: Startup smoke hangs
**What goes wrong:** smoke stage blocks on external readiness loops (DB/API credentials) and always times out.
**Why it happens:** using full runtime entrypoint with production startup behavior.
**How to avoid:** dedicated smoke mode/flag that verifies startup wiring and exits deterministically.
**Warning signs:** repeated timeout failures despite successful compile/tests.

### Pitfall 4: Targeted test blind spots
**What goes wrong:** changed modules bypass meaningful tests because mapping is incomplete.
**Why it happens:** no file-path-to-test-command manifest.
**How to avoid:** maintain deterministic mapping table and fail closed when no applicable test route is defined for protected paths.
**Warning signs:** PRs pass verifier with compile+smoke but regress behavior in changed modules.

### Pitfall 5: Unusable diagnostics
**What goes wrong:** operators/agent cannot distinguish infra errors from code regressions.
**Why it happens:** diagnostics are untyped and stage context is missing.
**How to avoid:** normalized failure categories and stage metadata with bounded log excerpts.
**Warning signs:** repeated "verification failed" with no stage-specific reason.

---

## Code Examples

Verified patterns from official/runtime docs and current code style:

### Isolated worktree lifecycle
```typescript
import { spawn } from 'node:child_process';

async function createWorktree(repoRoot: string, headSha: string, workspacePath: string) {
  await runBounded(['git', 'worktree', 'add', '--detach', workspacePath, headSha], repoRoot, 30_000);
}

async function cleanupWorktree(repoRoot: string, workspacePath: string) {
  await runBounded(['git', 'worktree', 'remove', '--force', workspacePath], repoRoot, 30_000);
  await runBounded(['git', 'worktree', 'prune'], repoRoot, 30_000);
}
```

### Bounded stage command wrapper
```typescript
function runBounded(command: string[], cwd: string, timeoutMs: number): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0]!, command.slice(1), {
      cwd,
      shell: false,
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
      env: { ...process.env },
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));

    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        code,
        stdout: Buffer.concat(stdout as unknown as Uint8Array[]).toString('utf8'),
        stderr: Buffer.concat(stderr as unknown as Uint8Array[]).toString('utf8'),
      });
    });
  });
}
```

### Stage contract declaration
```typescript
const requiredStages = ['compile', 'targetedTests', 'startupSmoke'] as const;

function canPromote(stages: Array<{ name: string; status: string }>): boolean {
  return requiredStages.every((stage) => stages.some((s) => s.name === stage && s.status === 'pass'));
}
```

---

## State of the Art

| Old Approach (current Phase 11 baseline) | Current Approach for Phase 12 | When Changed | Impact |
|------------------------------------------|-------------------------------|--------------|--------|
| In-memory compile + forked `tool.execute` only (`runInSandbox`) | Full isolated workspace verification pipeline with required compile/tests/startup stages | Phase 12 | Closer production-signal verification before promotion |
| Timeout-focused guardrails | Timeout + memory/output bounds + deterministic cleanup | Phase 12 | Reduced risk of wedging main loop/resources |
| Free-form failure summaries | Typed diagnostics envelope with stage/failure categorization | Phase 12 | Better autonomous recovery and operator visibility |

**Deprecated/outdated for builtin promotion path:**
- Relying on single sandbox execute pass as sole pre-promotion gate for core changes.

---

## Open Questions

1. **Targeted test command strategy for packages that currently lack `test` scripts**
   - What we know: repo currently has build scripts but no clear test runner conventions across workspaces.
   - What is unclear: whether to introduce `node:test`, Vitest, or package-specific smoke scripts as the default targeted test mechanism.
   - Recommendation: decide one baseline runner in Phase 12 Plan 01 and fail closed when required path mappings are missing.

2. **Startup smoke semantics**
   - What we know: `apps/agent/src/index.ts` is long-running and depends on live DB/Redis/OpenRouter configuration.
   - What is unclear: exact minimal startup-health contract that should pass in isolated verification without full production infra.
   - Recommendation: add explicit smoke mode that validates boot wiring and exits quickly.

3. **Resource isolation depth**
   - What we know: Node process-level bounds are straightforward and fit current architecture.
   - What is unclear: whether project requires container/cgroup-level CPU/memory/network enforcement immediately.
   - Recommendation: ship process-level bounds in Phase 12, design extension point for containerized verifier in future hardening.

4. **Diagnostics exposure surface**
   - What we know: tool payload currently returns promotion diagnostics (`promotionBlocked`, `blockReasons`, `mergeError`).
   - What is unclear: whether full per-stage diagnostics should also be persisted in DB tables in Phase 12 or deferred to Phase 13 observability.
   - Recommendation: return full diagnostics payload now; persist minimal summary now and leave richer dashboard surfacing for Phase 13 if needed.

---

## Sources

### Primary (HIGH confidence)

- Internal implementation and current behavior:
  - `/Users/sn0w/Documents/dev/jarvis/packages/tools/src/self-extension/staging-deployer.ts`
  - `/Users/sn0w/Documents/dev/jarvis/packages/tools/src/self-extension/sandbox-runner.ts`
  - `/Users/sn0w/Documents/dev/jarvis/packages/tools/src/self-extension/tool-writer.ts`
  - `/Users/sn0w/Documents/dev/jarvis/packages/tools/src/self-extension/github-pipeline.ts`
  - `/Users/sn0w/Documents/dev/jarvis/packages/tools/src/self-extension/pipeline-context.ts`
  - `/Users/sn0w/Documents/dev/jarvis/packages/tools/src/self-extension/branch-naming.ts`
  - `/Users/sn0w/Documents/dev/jarvis/apps/agent/src/index.ts`
  - `/Users/sn0w/Documents/dev/jarvis/.planning/ROADMAP.md`
  - `/Users/sn0w/Documents/dev/jarvis/.planning/REQUIREMENTS.md`
- Official docs:
  - Node child process API: https://nodejs.org/download/release/v22.19.0/docs/api/child_process.html
  - Node CLI options (`--max-old-space-size`): https://nodejs.org/docs/latest-v25.x/api/cli.html
  - Node process diagnostics APIs: https://nodejs.org/api/process.html
  - Git worktree manual: https://git-scm.com/docs/git-worktree
  - pnpm filtering docs: https://pnpm.io/filtering

### Secondary (MEDIUM confidence)

- Turborepo filtered task execution reference:
  - https://turborepo.com/docs/reference/run

### Tertiary (LOW confidence)

- None.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - grounded in existing code and official Node/Git/pnpm docs.
- Architecture patterns: HIGH-MEDIUM - implementation path is clear; specific smoke-test shape needs product decision.
- Pitfalls: MEDIUM - based on common failure modes and current codebase constraints.

**Research date:** 2026-02-19
**Valid until:** 2026-03-21 (revalidate if runtime/tooling stack changes materially)
