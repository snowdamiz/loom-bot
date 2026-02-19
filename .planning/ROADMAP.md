# Roadmap: Jarvis

## Milestones

- ✅ **v1.0 MVP** — Phases 1-9 (shipped 2026-02-19)
- 🚧 **v1.1 Self-Extension Safety and GitHub Control** — Phases 10-13 (planning)

## Current Milestone Plan (v1.1)

- [x] **Phase 10: GitHub Identity and Repo Trust** (completed 2026-02-19)
Goal: Replace setup stub with real GitHub identity + repository binding so self-modification has an authenticated source of truth.
Requirements: SEXT-01, SEXT-02, SEXT-03, SEXT-04
Success criteria:
1. Setup flow performs real OAuth code exchange and stores connected identity.
2. Repository binding is persisted and validated before self-modification runs.
3. Built-in modification path is rejected when GitHub connection/binding is missing.

- [ ] **Phase 11: Version-Controlled Self-Modification Pipeline**
Goal: Route every core self-change through branch/commit/PR flow in the connected repository.
Requirements: SEXT-05, SEXT-06, SEXT-07, SEXT-08
Success criteria:
1. Self-modification creates deterministic short-lived branch per change.
2. Commits include goal/cycle metadata for traceability.
3. PR is created/updated with sandbox evidence and status.
4. Promotion path blocks merge when checks fail.

- [ ] **Phase 12: Isolated Sandbox Verification**
Goal: Test candidate changes in isolation with bounded runtime and actionable diagnostics.
Requirements: SEXT-09, SEXT-10, SEXT-11, SEXT-12
Success criteria:
1. Candidate code executes in sandbox workspace separate from live agent runtime.
2. Compile + targeted tests + startup smoke checks run before promotion.
3. Time/resource bounds enforce safe failure behavior.
4. Failures emit structured diagnostics for operator and agent reasoning.

- [ ] **Phase 13: Promotion Guardrails, Rollback, and Visibility**
Goal: Make failed promotions recoverable and make self-extension state observable.
Requirements: SEXT-13, SEXT-14, SEXT-15, SEXT-16
Success criteria:
1. Known-good baseline and rollback path are automated and tested.
2. Every lifecycle stage emits append-only audit events.
3. Dashboard/API exposes pipeline health and last PR/test result.
4. Operator can pause self-extension promotion without halting all agent activity.

## Phase Details

### Phase 10: GitHub Identity and Repo Trust
Goal: Replace setup stub with real GitHub identity + repository binding so self-modification has an authenticated source of truth.
**Goal**: Replace setup stub with real GitHub identity + repository binding so self-modification has an authenticated source of truth.
Depends on: Phase 9
Requirements: SEXT-01, SEXT-02, SEXT-03, SEXT-04
**Success Criteria** (what must be TRUE):
  1. Setup flow performs real OAuth code exchange and stores connected identity.
  2. Repository binding is persisted and validated before self-modification runs.
  3. Built-in modification path is rejected when GitHub connection/binding is missing.
Plans: 3 plans

Plans:
- [ ] 10-01-PLAN.md — Schema + OAuth state persistence + operator env docs
- [ ] 10-02-PLAN.md — Real GitHub OAuth start/callback + encrypted token/identity persistence
- [ ] 10-03-PLAN.md — Repo binding UX/API + builtinModify trust guard

### Phase 11: Version-Controlled Self-Modification Pipeline
Goal: Route every core self-change through branch/commit/PR flow in the connected repository.
Depends on: Phase 10
Requirements: SEXT-05, SEXT-06, SEXT-07, SEXT-08
Success Criteria (what must be TRUE):
  1. Self-modification creates deterministic short-lived branch per change.
  2. Commits include goal/cycle metadata for traceability.
  3. PR is created/updated with sandbox evidence and status.
  4. Promotion path blocks merge when checks fail.
Plans: 3 plans

Plans:
- [x] 11-01-PLAN.md — Execution context propagation + deterministic branch and metadata primitives (completed 2026-02-19)
- [ ] 11-02-PLAN.md — GitHub branch/commit/PR upsert pipeline with sandbox evidence status
- [ ] 11-03-PLAN.md — Promotion gate with status-based merge blocking and cleanup

### Phase 12: Isolated Sandbox Verification
Goal: Test candidate changes in isolation with bounded runtime and actionable diagnostics.
Depends on: Phase 11
Requirements: SEXT-09, SEXT-10, SEXT-11, SEXT-12
Success Criteria (what must be TRUE):
  1. Candidate code executes in sandbox workspace separate from live agent runtime.
  2. Compile + targeted tests + startup smoke checks run before promotion.
  3. Time/resource bounds enforce safe failure behavior.
  4. Failures emit structured diagnostics for operator and agent reasoning.
Plans: 0/0 planned

### Phase 13: Promotion Guardrails, Rollback, and Visibility
Goal: Make failed promotions recoverable and make self-extension state observable.
Depends on: Phase 12
Requirements: SEXT-13, SEXT-14, SEXT-15, SEXT-16
Success Criteria (what must be TRUE):
  1. Known-good baseline and rollback path are automated and tested.
  2. Every lifecycle stage emits append-only audit events.
  3. Dashboard/API exposes pipeline health and last PR/test result.
  4. Operator can pause self-extension promotion without halting all agent activity.
Plans: 0/0 planned

## Previous Milestone Archive

<details>
<summary>✅ v1.0 MVP (Phases 1-9) — SHIPPED 2026-02-19</summary>

- [x] Phase 1: Infrastructure (4/4 plans) — completed 2026-02-18
- [x] Phase 2: AI Backbone and Safety (3/3 plans) — completed 2026-02-18
- [x] Phase 3: Autonomous Loop (6/6 plans) — completed 2026-02-18
- [x] Phase 4: Wallet and Financial Governance (4/4 plans) — completed 2026-02-18
- [x] Phase 5: Web Dashboard (3/3 plans) — completed 2026-02-19
- [x] Phase 6: Browser, Identity, and Bootstrapping (4/4 plans) — completed 2026-02-19
- [x] Phase 7: Strategy Engine (2/2 plans) — completed 2026-02-19
- [x] Phase 8: Self-Extension (4/4 plans) — completed 2026-02-19
- [x] Phase 9: Integration Gap Closure (1/1 plan) — completed 2026-02-19

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 10. GitHub Identity and Repo Trust | v1.1 | Complete    | 2026-02-19 | — |
| 11. Version-Controlled Self-Modification Pipeline | v1.1 | 1/3 | In Progress | — |
| 12. Isolated Sandbox Verification | v1.1 | 0/0 | Planned | — |
| 13. Promotion Guardrails, Rollback, and Visibility | v1.1 | 0/0 | Planned | — |
| 1-9. v1.0 phases | v1.0 | 31/31 | Complete | 2026-02-19 |

---
*Full v1.0 details archived in `.planning/milestones/v1.0-ROADMAP.md`*
