import { z } from 'zod';
import { pool } from '@jarvis/db';
import type { ToolDefinition } from '../types.js';

// ---------------------------------------------------------------------------
// DDL validation
// ---------------------------------------------------------------------------

/**
 * Validates a DDL SQL string for safety:
 *  - Rejects destructive operations (DROP TABLE, DROP COLUMN, TRUNCATE, DROP DATABASE, DROP SCHEMA)
 *  - Restricts non-agent_* tables to ADD COLUMN only (no ALTER COLUMN, rename, etc.)
 *  - Anything not in the reject list passes (CREATE TABLE, CREATE INDEX, ADD CONSTRAINT, etc.)
 */
export function validateDdl(sql: string): { valid: boolean; error?: string } {
  const normalized = sql.trim().replace(/\s+/g, ' ').toUpperCase();

  // Destructive DDL — always forbidden
  if (/DROP\s+TABLE/i.test(sql)) {
    return {
      valid: false,
      error: 'DROP TABLE is not allowed. Agent can only create or modify tables.',
    };
  }
  if (/DROP\s+COLUMN/i.test(sql)) {
    return {
      valid: false,
      error: 'DROP COLUMN is not allowed. Use ALTER COLUMN to modify existing columns.',
    };
  }
  if (/TRUNCATE/i.test(sql)) {
    return { valid: false, error: 'TRUNCATE is not allowed.' };
  }
  if (/DROP\s+DATABASE/i.test(sql)) {
    return { valid: false, error: 'DROP DATABASE is not allowed.' };
  }
  if (/DROP\s+SCHEMA/i.test(sql)) {
    return { valid: false, error: 'DROP SCHEMA is not allowed.' };
  }

  // Namespace enforcement for ALTER TABLE on core (non-agent_*) tables
  const alterMatch = /ALTER\s+TABLE\s+(\w+)/i.exec(sql);
  if (alterMatch) {
    const tableName = alterMatch[1];
    const isAgentTable = tableName.toLowerCase().startsWith('agent_');

    if (!isAgentTable) {
      // Core table: only ADD COLUMN is allowed
      const hasAddColumn = /ADD\s+COLUMN/i.test(sql);
      const hasAlterColumn = /ALTER\s+COLUMN/i.test(sql);
      const hasDropConstraint = /DROP\s+CONSTRAINT/i.test(sql);
      const hasRename = /RENAME/i.test(sql);

      if (!hasAddColumn || hasAlterColumn || hasDropConstraint || hasRename) {
        return {
          valid: false,
          error:
            'Core tables (non-agent_* prefix) only support ADD COLUMN. Use agent_* prefixed tables for full control.',
        };
      }
    }
  }

  void normalized; // used for consistency — normalized string computed above
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Migration application
// ---------------------------------------------------------------------------

/**
 * Applies a named DDL migration inside a PostgreSQL transaction.
 *
 * - Idempotent: if migrationName already exists in agent_migrations, returns alreadyApplied=true
 * - Transactional: DDL is committed only if the INSERT into agent_migrations also succeeds
 * - Auto-rollback: any failure rolls back the entire transaction (no partial state)
 *
 * IMPORTANT: The DDL SQL must be fully constructed BEFORE calling this function.
 * Do NOT hold the connection while waiting for external async decisions (Pitfall 5).
 */
export async function applyAgentMigration(
  migrationName: string,
  ddlSql: string
): Promise<{ applied: boolean; error?: string; alreadyApplied?: boolean }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check
    const existing = await client.query(
      'SELECT id FROM agent_migrations WHERE migration_name = $1',
      [migrationName]
    );
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return { applied: false, alreadyApplied: true };
    }

    // Execute DDL — PostgreSQL DDL is fully transactional
    await client.query(ddlSql);

    // Record migration in audit table
    await client.query(
      'INSERT INTO agent_migrations (migration_name, sql_executed) VALUES ($1, $2)',
      [migrationName, ddlSql]
    );

    await client.query('COMMIT');
    return { applied: true };
  } catch (err) {
    await client.query('ROLLBACK');
    return {
      applied: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    // CRITICAL: always release the connection back to the pool
    client.release();
  }
}

// ---------------------------------------------------------------------------
// schema_extend ToolDefinition
// ---------------------------------------------------------------------------

const schemaExtendInput = z.object({
  migrationName: z
    .string()
    .min(1)
    .max(128)
    .describe(
      'Unique name for this migration, e.g. "create_agent_x402_transactions" or "add_column_agent_strategies_profit". Must be unique across all migrations.'
    ),
  sql: z
    .string()
    .min(1)
    .describe(
      'The DDL SQL to execute. Allowed: CREATE TABLE, ALTER TABLE ADD COLUMN, CREATE INDEX, ALTER COLUMN. ' +
        'Forbidden: DROP TABLE, DROP COLUMN, TRUNCATE. ' +
        'Tables prefixed with agent_* have full control. Core tables only support ADD COLUMN. ' +
        'PostgreSQL DDL is transactional — on error, everything rolls back automatically.'
    ),
});

type SchemaExtendInput = z.infer<typeof schemaExtendInput>;

type SchemaExtendOutput =
  | { success: true; applied: true; migrationName: string }
  | { success: true; alreadyApplied: true; migrationName: string }
  | { success: false; error: string };

/**
 * Creates the schema_extend tool that allows the agent to evolve its own database schema
 * via transactional DDL. Validates DDL safety, enforces namespace rules, wraps execution
 * in a PostgreSQL transaction, and tracks migrations in agent_migrations.
 *
 * Implements EXTEND-04 (agent extends its own schema) and STRAT-07 (agent creates
 * per-strategy P&L tables itself).
 */
export function createSchemaExtendTool(): ToolDefinition<SchemaExtendInput, SchemaExtendOutput> {
  return {
    name: 'schema_extend',
    description:
      'Extend the database schema by executing DDL (CREATE TABLE, ADD COLUMN, CREATE INDEX, ALTER COLUMN). ' +
      'All changes are wrapped in a PostgreSQL transaction — on error, the database is unchanged. ' +
      'You have full control over agent_* prefixed tables. Core tables support ADD COLUMN only. ' +
      'DROP TABLE and DROP COLUMN are forbidden. Each migration is tracked by name for idempotency. ' +
      'Use this to create tables for tracking data (P&L, transactions, metrics) or to add columns as needs evolve.',
    inputSchema: schemaExtendInput,
    timeoutMs: 30_000,

    async execute(input, signal): Promise<SchemaExtendOutput> {
      if (signal.aborted) {
        return { success: false, error: 'Operation aborted.' };
      }

      // Validate DDL safety and namespace rules before touching the DB
      const validation = validateDdl(input.sql);
      if (!validation.valid) {
        return { success: false, error: validation.error! };
      }

      const result = await applyAgentMigration(input.migrationName, input.sql);

      if (result.alreadyApplied) {
        return { success: true, alreadyApplied: true, migrationName: input.migrationName };
      }
      if (result.applied) {
        return { success: true, applied: true, migrationName: input.migrationName };
      }
      return { success: false, error: result.error ?? 'Unknown error applying migration.' };
    },
  };
}
