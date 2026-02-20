# Requirements: Jarvis v1.1

**Defined:** 2026-02-19
**Milestone:** v1.1 Self-Extension Safety and GitHub Control
**Goal:** Use connected GitHub for self-versioning and enforce sandbox test gates so the bot can extend itself without breaking core behavior.

## Scope

This milestone only covers hardening self-extension. Existing v1.0 capabilities are already shipped and archived in `.planning/milestones/v1.0-REQUIREMENTS.md`.

## v1.1 Requirements

### GitHub Identity and Repository Binding

- [x] **SEXT-01**: Setup wizard must implement real GitHub OAuth code exchange (no placeholder connection state).
- [x] **SEXT-02**: The system must persist a validated connected GitHub identity (username + account id) and selected target repository.
- [x] **SEXT-03**: Access tokens used for GitHub operations must be stored with the same credential security model as other secrets (no plaintext in logs).
- [x] **SEXT-04**: Self-modifying operations on built-in/core files must be denied when GitHub is not connected and repository binding is incomplete.

### Version-Controlled Self-Modification

- [x] **SEXT-05**: Every core self-modification must occur on a dedicated branch derived from the repository default branch.
- [x] **SEXT-06**: Each proposed change must produce a commit that includes machine-readable metadata (goal id, agent cycle id, tool name).
- [x] **SEXT-07**: The system must open/update a pull request for candidate changes and attach sandbox test evidence before merge.
- [x] **SEXT-08**: Merge/promotion must require successful sandbox and regression checks; failed checks must prevent merge.

### Sandbox Verification Gates

- [x] **SEXT-09**: Candidate code must be tested in an isolated sandbox workspace, not directly against live running source files.
- [x] **SEXT-10**: Sandbox execution must enforce timeout and resource limits so failed tests cannot wedge the main agent loop.
- [x] **SEXT-11**: Verification must include at least: TypeScript compile, targeted tests for changed modules, and a startup smoke check.
- [x] **SEXT-12**: Failed sandbox runs must return structured diagnostics that are logged and visible in operator tooling.

### Rollback, Recovery, and Observability

- [x] **SEXT-13**: The system must keep a known-good reference and provide automated rollback when promoted changes degrade agent startup or loop health.
- [x] **SEXT-14**: Every self-modification lifecycle stage must write append-only audit events (proposed, tested, promoted, rolled back, failed).
- [x] **SEXT-15**: Dashboard/API must expose self-extension pipeline state and latest PR/test outcome.
- [x] **SEXT-16**: Operator must be able to pause self-extension promotion independently from global kill switch.

## Out of Scope (v1.1)

- On-chain DeFi strategy execution changes
- New wallet primitives
- Non-self-extension dashboard feature work unrelated to pipeline visibility

## Traceability (Planned)

| Requirement | Planned Phase |
|-------------|---------------|
| SEXT-01 | Phase 10 |
| SEXT-02 | Phase 10 |
| SEXT-03 | Phase 10 |
| SEXT-04 | Phase 10 |
| SEXT-05 | Phase 11 |
| SEXT-06 | Phase 11 |
| SEXT-07 | Phase 11 |
| SEXT-08 | Phase 11 |
| SEXT-09 | Phase 12 |
| SEXT-10 | Phase 12 |
| SEXT-11 | Phase 12 |
| SEXT-12 | Phase 12 |
| SEXT-13 | Phase 13 |
| SEXT-14 | Phase 13 |
| SEXT-15 | Phase 13 |
| SEXT-16 | Phase 13 |

---
*Last updated: 2026-02-19 — v1.1 kickoff*
