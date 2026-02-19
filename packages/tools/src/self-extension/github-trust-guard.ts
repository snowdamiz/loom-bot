import { and, credentials, eq, isNull, setupState } from '@jarvis/db';
import type { DbClient } from '@jarvis/db';

/**
 * Enforces GitHub trust prerequisites for builtinModify flow.
 * Built-in modifications are fail-closed until setup has:
 * - connected GitHub identity,
 * - repository binding,
 * - active encrypted oauth_token credential reference.
 */
export async function assertGitHubTrustForBuiltinModify(db: DbClient): Promise<void> {
  const setupRows = await db.select().from(setupState).limit(1);
  const row = setupRows[0];

  if (!row) {
    throw new Error(
      'Built-in modification blocked: setup state is missing. Complete dashboard setup first.',
    );
  }

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
