import { and, credentials, eq, isNull, setupState, sql } from '@jarvis/db';
import type { DbClient, SetupState } from '@jarvis/db';

export interface TrustedGitHubContext {
  repoFullName: string;
  defaultBranch: string;
  githubUserId: string;
  githubUsername: string;
  tokenCredentialId: string;
  accessToken: string;
}

function getCredentialEncryptionKey(): string {
  const key = process.env.CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (!key) {
    throw new Error(
      'Built-in modification blocked: CREDENTIAL_ENCRYPTION_KEY is required for GitHub token decryption.',
    );
  }
  return key;
}

function collectMissingTrustSignals(row: SetupState): string[] {
  const missing: string[] = [];

  if (!row.githubConnected) {
    missing.push('GitHub account not connected');
  }
  if (!row.githubUserId || !row.githubUsername) {
    missing.push('GitHub identity metadata is incomplete');
  }
  if (!row.githubRepoId || !row.githubRepoFullName || !row.githubRepoDefaultBranch) {
    missing.push('trusted repository is not bound');
  }
  if (!row.githubRepoValidatedAt) {
    missing.push('repository trust has not been validated');
  }
  if (!row.githubTokenCredentialId) {
    missing.push('GitHub token credential reference is missing');
  }

  return missing;
}

async function loadSetupRow(db: DbClient): Promise<SetupState> {
  const setupRows = await db.select().from(setupState).limit(1);
  const row = setupRows[0];

  if (!row) {
    throw new Error(
      'Built-in modification blocked: setup state is missing. Complete dashboard setup first.',
    );
  }

  return row;
}

async function ensureActiveTokenCredential(db: DbClient, tokenCredentialId: string): Promise<void> {
  const credentialRows = await db
    .select({ id: credentials.id })
    .from(credentials)
    .where(and(
      eq(credentials.id, tokenCredentialId),
      eq(credentials.service, 'github'),
      eq(credentials.key, 'oauth_token'),
      eq(credentials.status, 'active'),
      isNull(credentials.identityId),
    ))
    .limit(1);

  if (credentialRows.length === 0) {
    throw new Error(
      'Built-in modification blocked: active GitHub OAuth credential was not found. Reconnect GitHub in setup.',
    );
  }
}

/**
 * Enforces GitHub trust prerequisites for builtinModify flow.
 * Built-in modifications are fail-closed until setup has:
 * - connected GitHub identity,
 * - repository binding,
 * - active encrypted oauth_token credential reference.
 */
export async function assertGitHubTrustForBuiltinModify(db: DbClient): Promise<void> {
  const row = await loadSetupRow(db);
  const missing = collectMissingTrustSignals(row);

  if (missing.length > 0) {
    throw new Error(
      `Built-in modification blocked: GitHub trust prerequisites are incomplete (${missing.join('; ')}). ` +
      'Reconnect GitHub and bind a writable repository in setup.',
    );
  }

  const tokenCredentialId = row.githubTokenCredentialId;
  if (!tokenCredentialId) {
    throw new Error(
      'Built-in modification blocked: GitHub token credential reference is missing. Reconnect GitHub in setup.',
    );
  }

  await ensureActiveTokenCredential(db, tokenCredentialId);
}

export async function resolveTrustedGitHubContext(db: DbClient): Promise<TrustedGitHubContext> {
  const row = await loadSetupRow(db);
  const missing = collectMissingTrustSignals(row);

  if (missing.length > 0) {
    throw new Error(
      `Built-in modification blocked: GitHub trust prerequisites are incomplete (${missing.join('; ')}). ` +
      'Reconnect GitHub and bind a writable repository in setup.',
    );
  }

  const tokenCredentialId = row.githubTokenCredentialId;
  if (!tokenCredentialId) {
    throw new Error(
      'Built-in modification blocked: GitHub token credential reference is missing. Reconnect GitHub in setup.',
    );
  }

  await ensureActiveTokenCredential(db, tokenCredentialId);

  const encKey = getCredentialEncryptionKey();
  const tokenResult = await db.execute(sql`
    SELECT pgp_sym_decrypt(encrypted_value, ${encKey}) AS value
    FROM credentials
    WHERE id = ${tokenCredentialId}
      AND service = 'github'
      AND key = 'oauth_token'
      AND status = 'active'
      AND identity_id IS NULL
    LIMIT 1
  `);

  const tokenRows = tokenResult.rows as Array<{ value: string }>;
  const accessToken = tokenRows[0]?.value?.trim();
  if (!accessToken) {
    throw new Error(
      'Built-in modification blocked: decrypted GitHub OAuth token is unavailable. Reconnect GitHub in setup.',
    );
  }

  return {
    repoFullName: row.githubRepoFullName as string,
    defaultBranch: row.githubRepoDefaultBranch as string,
    githubUserId: row.githubUserId as string,
    githubUsername: row.githubUsername as string,
    tokenCredentialId,
    accessToken,
  };
}
