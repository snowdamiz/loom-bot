import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index.js';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,
});

export const db = drizzle(pool, { schema });

export type DbClient = typeof db;

/**
 * Gracefully shut down the connection pool.
 * Call this before process exit to drain in-flight queries.
 */
export async function shutdown(): Promise<void> {
  await pool.end();
}
