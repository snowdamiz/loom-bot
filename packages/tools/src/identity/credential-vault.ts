import { z } from 'zod';
import { sql, ensurePgcryptoExtension } from '@jarvis/db';
import type { DbClient } from '@jarvis/db';
import type { ToolDefinition } from '../types.js';

/**
 * IDENT-01, IDENT-02: Encrypted credential vault using pgcrypto AES-256.
 *
 * Credentials are stored encrypted via pgp_sym_encrypt and decrypted on retrieval.
 * Every read access is logged to credential_access_audit (IDENT-02 audit requirement).
 *
 * The encryption key is loaded from CREDENTIAL_ENCRYPTION_KEY env var at call time.
 * This key must never be stored in the DB — only used in the SQL template to encrypt/decrypt.
 */

function getEncryptionKey(): string {
  const key = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      'CREDENTIAL_ENCRYPTION_KEY env var is not set. ' +
        'This key is required to encrypt and decrypt credentials. ' +
        'Set it to a strong random string (e.g. 32+ chars) and never change it after first use.',
    );
  }
  return key;
}

// ---------------------------------------------------------------------------
// storeCredential
// ---------------------------------------------------------------------------

export interface StoreCredentialParams {
  identityId?: string;
  service: string;
  key: string;
  value: string;
  expiresAt?: Date;
}

/**
 * Store an encrypted credential in Postgres using pgp_sym_encrypt (AES-256).
 * Returns the generated credential UUID.
 */
export async function storeCredential(
  db: DbClient,
  params: StoreCredentialParams,
): Promise<string> {
  const encKey = getEncryptionKey();
  const { identityId, service, key, value, expiresAt } = params;
  await ensurePgcryptoExtension(db);

  const result = await db.execute(sql`
    INSERT INTO credentials (id, identity_id, service, key, encrypted_value, status, created_at, expires_at)
    VALUES (
      gen_random_uuid(),
      ${identityId ?? null},
      ${service},
      ${key},
      pgp_sym_encrypt(${value}, ${encKey}, 'cipher-algo=aes256'),
      'active',
      now(),
      ${expiresAt ?? null}
    )
    RETURNING id
  `);

  const rows = result.rows as Array<{ id: string }>;
  return rows[0].id;
}

// ---------------------------------------------------------------------------
// retrieveCredential
// ---------------------------------------------------------------------------

export interface RetrieveCredentialParams {
  identityId?: string;
  service: string;
  key: string;
  accessedBy: string;
  purpose: string;
}

export interface RetrievedCredential {
  value: string;
  credentialId: string;
}

/**
 * Retrieve and decrypt a credential. Logs every access to credential_access_audit.
 * Returns null if no active credential found.
 */
export async function retrieveCredential(
  db: DbClient,
  params: RetrieveCredentialParams,
): Promise<RetrievedCredential | null> {
  const encKey = getEncryptionKey();
  const { identityId, service, key, accessedBy, purpose } = params;
  await ensurePgcryptoExtension(db);

  // Build WHERE clause based on whether identityId is provided
  const credResult = identityId
    ? await db.execute(sql`
        SELECT id, pgp_sym_decrypt(encrypted_value, ${encKey}) as value
        FROM credentials
        WHERE identity_id = ${identityId}
          AND service = ${service}
          AND key = ${key}
          AND status = 'active'
        LIMIT 1
      `)
    : await db.execute(sql`
        SELECT id, pgp_sym_decrypt(encrypted_value, ${encKey}) as value
        FROM credentials
        WHERE identity_id IS NULL
          AND service = ${service}
          AND key = ${key}
          AND status = 'active'
        LIMIT 1
      `);

  const rows = credResult.rows as Array<{ id: string; value: string }>;
  if (rows.length === 0) {
    return null;
  }

  const { id: credentialId, value } = rows[0];

  // Audit log every access — IDENT-02
  await db.execute(sql`
    INSERT INTO credential_access_audit (id, credential_id, accessed_by, purpose, identity_id, accessed_at)
    VALUES (
      gen_random_uuid(),
      ${credentialId},
      ${accessedBy},
      ${purpose},
      ${identityId ?? null},
      now()
    )
  `);

  return { value, credentialId };
}

// ---------------------------------------------------------------------------
// listCredentials
// ---------------------------------------------------------------------------

export interface CredentialMetadata {
  id: string;
  service: string;
  key: string;
  status: string;
  createdAt: Date | null;
  expiresAt: Date | null;
}

/**
 * List credentials for an identity (metadata only — no decryption).
 * Safe to display in dashboard or agent context without exposing secrets.
 */
export async function listCredentials(
  db: DbClient,
  identityId: string,
): Promise<CredentialMetadata[]> {
  const result = await db.execute(sql`
    SELECT id, service, key, status, created_at, expires_at
    FROM credentials
    WHERE identity_id = ${identityId}
    ORDER BY created_at DESC
  `);

  return (result.rows as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    service: row.service as string,
    key: row.key as string,
    status: row.status as string,
    createdAt: row.created_at as Date | null,
    expiresAt: row.expires_at as Date | null,
  }));
}

// ---------------------------------------------------------------------------
// rotateCredential
// ---------------------------------------------------------------------------

export interface RotateCredentialParams {
  credentialId: string;
  newValue: string;
}

/**
 * Rotate a credential: marks the old one 'rotated' and inserts a new active row.
 * Returns the new credential ID.
 */
export async function rotateCredential(
  db: DbClient,
  params: RotateCredentialParams,
): Promise<string> {
  const encKey = getEncryptionKey();
  const { credentialId, newValue } = params;
  await ensurePgcryptoExtension(db);

  // Fetch current credential metadata for copying to the new row
  const metaResult = await db.execute(sql`
    SELECT identity_id, service, key, expires_at
    FROM credentials
    WHERE id = ${credentialId} AND status = 'active'
    LIMIT 1
  `);

  const metaRows = metaResult.rows as Array<{
    identity_id: string | null;
    service: string;
    key: string;
    expires_at: Date | null;
  }>;

  if (metaRows.length === 0) {
    throw new Error(`Credential ${credentialId} not found or not active`);
  }

  const { identity_id, service, key, expires_at } = metaRows[0];

  // Mark old credential as rotated
  await db.execute(sql`
    UPDATE credentials SET status = 'rotated' WHERE id = ${credentialId}
  `);

  // Insert new active credential with same identity/service/key
  const newResult = await db.execute(sql`
    INSERT INTO credentials (id, identity_id, service, key, encrypted_value, status, created_at, expires_at)
    VALUES (
      gen_random_uuid(),
      ${identity_id},
      ${service},
      ${key},
      pgp_sym_encrypt(${newValue}, ${encKey}, 'cipher-algo=aes256'),
      'active',
      now(),
      ${expires_at}
    )
    RETURNING id
  `);

  const newRows = newResult.rows as Array<{ id: string }>;
  return newRows[0].id;
}

// ---------------------------------------------------------------------------
// ToolDefinition factories
// ---------------------------------------------------------------------------

/**
 * Factory: credential_store ToolDefinition.
 * Allows the agent to store an encrypted credential for a service.
 */
export function createCredentialStoreTool(db: DbClient): ToolDefinition {
  return {
    name: 'credential_store',
    description:
      'Store an encrypted credential in the vault. ' +
      'Encrypts the value with AES-256 via pgcrypto before writing to Postgres. ' +
      'Use this for API keys, passwords, OAuth tokens, and any secret the agent needs to persist.',
    inputSchema: z.object({
      identityId: z.string().uuid().optional().describe('Identity this credential belongs to. Omit for operator-level credentials.'),
      service: z.string().min(1).describe('Service name, e.g. "twitter", "openai", "stripe"'),
      key: z.string().min(1).describe('Credential type, e.g. "api_key", "password", "oauth_token"'),
      value: z.string().min(1).describe('The secret value to encrypt and store'),
      expiresAt: z.string().datetime().optional().describe('ISO 8601 expiry date. Omit if no expiry.'),
    }),
    timeoutMs: 15_000,
    execute: async (input, _signal) => {
      const { identityId, service, key, value, expiresAt } = input as {
        identityId?: string;
        service: string;
        key: string;
        value: string;
        expiresAt?: string;
      };
      const credentialId = await storeCredential(db, {
        identityId,
        service,
        key,
        value,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      });
      return { credentialId };
    },
  };
}

/**
 * Factory: credential_retrieve ToolDefinition.
 * Allows the agent to retrieve a decrypted credential value.
 * Per locked decision: agent gets full access to raw credential values — no redaction.
 */
export function createCredentialRetrieveTool(db: DbClient): ToolDefinition {
  return {
    name: 'credential_retrieve',
    description:
      'Retrieve a decrypted credential from the vault. ' +
      'Returns the raw secret value. ' +
      'Every retrieval is logged to the audit trail with your stated purpose. ' +
      'Use this to access API keys, passwords, and tokens previously stored.',
    inputSchema: z.object({
      identityId: z.string().uuid().optional().describe('Identity ID the credential belongs to. Omit for operator-level credentials.'),
      service: z.string().min(1).describe('Service name, e.g. "twitter", "openai"'),
      key: z.string().min(1).describe('Credential type, e.g. "api_key", "password"'),
      purpose: z.string().min(1).describe('Why you need this credential — logged in audit trail'),
    }),
    timeoutMs: 15_000,
    execute: async (input, _signal) => {
      const { identityId, service, key, purpose } = input as {
        identityId?: string;
        service: string;
        key: string;
        purpose: string;
      };
      const result = await retrieveCredential(db, {
        identityId,
        service,
        key,
        accessedBy: 'agent-tool',
        purpose,
      });
      if (!result) {
        return { error: 'not found' };
      }
      return { value: result.value };
    },
  };
}
