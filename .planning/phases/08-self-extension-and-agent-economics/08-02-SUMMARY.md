---
phase: 08-self-extension-and-agent-economics
plan: 02
subsystem: database
tags: [postgres, ddl, transactions, schema-extend, agent-migrations, drizzle, pool]

# Dependency graph
requires:
  - phase: 08-01
    provides: agent_migrations Postgres table, pool from @jarvis/db client.ts
  - phase: 01-infrastructure
    provides: drizzle schema pattern, pnpm strict isolation, @jarvis/db pool export
provides:
  - createSchemaExtendTool() — schema_extend ToolDefinition for agent-driven DDL via transactional PostgreSQL
  - validateDdl() — DDL safety checker: rejects DROP TABLE/COLUMN/TRUNCATE, restricts core tables to ADD COLUMN
  - applyAgentMigration() — transactional DDL application with idempotency check via agent_migrations
affects:
  - 08-04 (tool registration plan wires createSchemaExtendTool into the registry)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - DDL safety via regex allowlist/denylist before any DB connection acquired
    - agent_* namespace prefix as namespace boundary — full control inside, ADD COLUMN only outside
    - pool.connect() for raw client — drizzle instance unsuitable for manual BEGIN/COMMIT/ROLLBACK
    - Connection released in finally block — prevents pool exhaustion on any error path
    - DDL SQL fully constructed before connection acquired (Pitfall 5 from 08-RESEARCH.md)

key-files:
  created:
    - packages/tools/src/self-extension/schema-extend.ts
  modified: []

key-decisions:
  - "validateDdl uses case-insensitive regex on original SQL (not normalized uppercase) for DROP/TRUNCATE checks — avoids false negatives from normalization artifacts"
  - "agent_* prefix boundary: full DDL control inside prefix, ADD COLUMN only on core tables — agent can always create new agent_* tables instead of modifying core schema"
  - "On error applyAgentMigration returns structured result (never throws) — agent decides whether to fix SQL and retry or abandon (locked decision)"
  - "Tasks 1 and 2 both operate on schema-extend.ts; committed as one atomic unit since the file is inseparable — no partial implementation state"

patterns-established:
  - "schema_extend validates before connecting: validateDdl() called before pool.connect() — no connection held during validation"
  - "Idempotency via migration name unique constraint in agent_migrations — SELECT before INSERT inside same transaction"

requirements-completed: [EXTEND-04, STRAT-07]

# Metrics
duration: 2min
completed: 2026-02-19
---

# Phase 8 Plan 02: Schema Extend Tool Summary

**schema_extend ToolDefinition with transactional DDL execution, regex-based safety validation, agent_* namespace enforcement, and idempotent migration tracking via agent_migrations**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-19T05:44:16Z
- **Completed:** 2026-02-19T05:45:57Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Implemented `validateDdl()` that rejects 5 categories of destructive DDL (DROP TABLE, DROP COLUMN, TRUNCATE, DROP DATABASE, DROP SCHEMA) and restricts core (non-agent_*) tables to ADD COLUMN only — verified with 13 test cases covering both reject and allow paths
- Implemented `applyAgentMigration()` using raw pg pool client with explicit BEGIN/COMMIT/ROLLBACK, idempotency check against agent_migrations, and guaranteed connection release in finally block
- Exported `createSchemaExtendTool()` returning a full ToolDefinition with Zod input schema, 30s timeout, abort signal check, and structured non-throwing error returns
- Full workspace build (`pnpm build`) passes across all 10 packages with no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1+2: DDL validation, migration application internals, and schema_extend ToolDefinition** - `3759545` (feat)
   - Both tasks share the same file; committed as one atomic unit

**Plan metadata:** _(docs commit hash follows)_

## Files Created/Modified
- `packages/tools/src/self-extension/schema-extend.ts` - validateDdl(), applyAgentMigration(), createSchemaExtendTool() — full schema_extend tool with transactional DDL and migration tracking

## Decisions Made
- validateDdl uses regex on original SQL (not normalized), ensuring case-insensitive matching without normalization artifacts
- agent_* namespace prefix as the boundary: full control inside, ADD COLUMN only outside — this ensures the agent can always create new agent_* tables rather than mutating core schema
- applyAgentMigration never throws — all outcomes expressed as structured return value (applied, alreadyApplied, error) per locked Phase 8 decision
- Tasks 1 and 2 committed atomically since both operate on the same file with no separable intermediate state

## Deviations from Plan

### Implementation Notes

**Task atomicity consolidation (not a deviation, design clarification):**
- Plan listed Task 1 (internals) and Task 2 (ToolDefinition) as separate tasks but both modify only `schema-extend.ts`
- Written and committed as one atomic unit since the file cannot be in a meaningful partial state
- No behavior change — all required code from both task specs is present in the single commit

---

**Total deviations:** None — plan executed exactly as specified, tasks 1 and 2 combined into single commit due to shared file.
**Impact on plan:** No scope creep. All required code present and verified.

## Issues Encountered
None — build passed first try, all validation logic verified with inline tests.

## User Setup Required
None - no external service configuration required. The schema_extend tool uses the existing DATABASE_URL connection pool from @jarvis/db.

## Next Phase Readiness
- `createSchemaExtendTool()` is ready to be registered in Plan 04 tool registration
- `validateDdl()` exported for potential reuse in Plan 03 (self-extension tool may want to validate DDL input)
- agent_migrations table (from Plan 01) is used by applyAgentMigration() — dependency confirmed working

## Self-Check: PASSED

All created files verified present on disk. Task commit 3759545 verified in git log.

---
*Phase: 08-self-extension-and-agent-economics*
*Completed: 2026-02-19*
