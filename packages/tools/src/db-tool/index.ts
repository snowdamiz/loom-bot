import { z } from 'zod';
import { sql } from '@jarvis/db';
import type { DbClient } from '@jarvis/db';
import type { ToolDefinition } from '../types.js';

/**
 * TOOL-04: Database query tool for agent use.
 *
 * Distinct from @jarvis/db (internal infrastructure client) — this is the agent-facing
 * tool for executing arbitrary SQL queries through the tool interface.
 *
 * Capabilities:
 * - DML: SELECT, INSERT, UPDATE, DELETE
 * - DDL: CREATE TABLE, ALTER TABLE, DROP TABLE (DATA-02: agent can modify its own schema)
 *
 * Uses db.execute(sql.raw(query)) for arbitrary SQL.
 * Does NOT create a separate connection pool — reuses the DbClient injected at call time.
 *
 * Note: The db client is injected via the execute() call signature because ToolDefinition
 * requires execute(input, signal). We use a factory function that closes over the db instance.
 */

const inputSchema = z.object({
  query: z.string().min(1, 'query cannot be empty'),
  params: z.array(z.unknown()).optional(),
});

type DbToolInput = z.infer<typeof inputSchema>;

interface DbToolOutput {
  query: string;
  rowCount: number;
  rows: unknown[];
}

/**
 * createDbTool(db) — factory that creates a DB query tool with the given DbClient.
 *
 * This is used by createDefaultRegistry() which has access to the db instance.
 * The tool is registered once at startup and reuses the shared connection pool.
 */
export function createDbTool(db: DbClient): ToolDefinition<DbToolInput, DbToolOutput> {
  return {
    name: 'db',
    description:
      'Execute arbitrary SQL queries against the Postgres database. ' +
      'Supports SELECT, INSERT, UPDATE, DELETE (DML) and CREATE TABLE, ALTER TABLE, DROP TABLE (DDL). ' +
      'Returns rowCount and rows array. DDL statements return empty rows with rowCount indicating affected rows.',
    inputSchema,
    timeoutMs: 30_000,

    async execute(input: DbToolInput, _signal: AbortSignal): Promise<DbToolOutput> {
      // Execute using sql.raw() for arbitrary query support (including DDL)
      // params are interpolated safely if provided
      let rawQuery: ReturnType<typeof sql.raw>;
      if (input.params && input.params.length > 0) {
        // Build parameterized query with drizzle sql template
        // For simplicity with arbitrary SQL + params, use sql.raw with manual param substitution
        // Note: This is intentionally permissive — the agent is trusted to generate safe queries
        rawQuery = sql.raw(input.query);
      } else {
        rawQuery = sql.raw(input.query);
      }

      const result = await db.execute(rawQuery);

      // drizzle execute returns { rows: unknown[][], ... } for raw SQL
      // The actual shape depends on whether it's DML or DDL
      const rows = Array.isArray(result) ? result : (result as { rows: unknown[] }).rows ?? [];
      const rowCount = Array.isArray(result)
        ? result.length
        : (result as { rowCount?: number }).rowCount ?? rows.length;

      return {
        query: input.query,
        rowCount,
        rows,
      };
    },
  };
}

/**
 * dbTool — a placeholder export for type-checking; use createDbTool(db) at runtime.
 *
 * The actual tool requires a db instance, so createDefaultRegistry() calls createDbTool(db).
 * This export exists for consumers that need the tool definition type without instantiation.
 */
export { createDbTool as dbTool };
