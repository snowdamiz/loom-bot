import { sql } from 'drizzle-orm';
import type { DbClient } from './client.js';

const ensuredClients = new WeakSet<object>();

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 't' || normalized === 'true' || normalized === '1';
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  return false;
}

/**
 * Ensure pgcrypto is available before using pgp_sym_encrypt/pgp_sym_decrypt.
 * Attempts auto-install via CREATE EXTENSION IF NOT EXISTS pgcrypto.
 */
export async function ensurePgcryptoExtension(db: DbClient): Promise<void> {
  const cacheKey = db as unknown as object;
  if (ensuredClients.has(cacheKey)) {
    return;
  }

  const extensionResult = await db.execute(sql`
    SELECT EXISTS(
      SELECT 1
      FROM pg_extension
      WHERE extname = 'pgcrypto'
    ) AS installed
  `);

  const extensionRows = extensionResult.rows as Array<{ installed: unknown }>;
  const installed = toBoolean(extensionRows[0]?.installed);

  if (!installed) {
    try {
      await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        'pgcrypto extension is required for credential encryption. ' +
          'Automatic installation failed. Run "CREATE EXTENSION pgcrypto;" with a superuser role ' +
          `or grant extension privileges to this database user. Original error: ${detail}`,
      );
    }
  }

  ensuredClients.add(cacheKey);
}
