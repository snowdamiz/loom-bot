import { Hono } from 'hono';
import { db, setupState, sql, oauthState, eq } from '@jarvis/db';
import {
  exchangeOAuthCode,
  fetchAuthenticatedUser,
  getGitHubOAuthConfig,
  hashOAuthState,
} from './github-oauth-helpers.js';

const app = new Hono();

function requireCredentialEncryptionKey(): string {
  const key = process.env.CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (!key) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY is required for GitHub OAuth token storage');
  }

  return key;
}

function normalizeReturnTo(rawReturnTo: string | null | undefined): string {
  if (typeof rawReturnTo !== 'string' || rawReturnTo.length === 0) {
    return '/';
  }

  if (!rawReturnTo.startsWith('/') || rawReturnTo.startsWith('//')) {
    return '/';
  }

  return rawReturnTo;
}

function withQuery(path: string, params: Record<string, string>): string {
  const url = new URL(path, 'http://localhost');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return `${url.pathname}${url.search}`;
}

/**
 * Public callback route used by GitHub OAuth redirect.
 * This route must stay outside /api bearer middleware.
 */
app.get('/callback', async (c) => {
  const code = c.req.query('code')?.trim();
  const state = c.req.query('state')?.trim();

  if (!code || !state) {
    return c.json({ error: 'Missing required OAuth callback parameters' }, 400);
  }

  const stateHash = hashOAuthState(state);

  const consumedResult = await db.execute(sql`
    UPDATE oauth_state
    SET consumed_at = now()
    WHERE state_hash = ${stateHash}
      AND consumed_at IS NULL
      AND expires_at > now()
    RETURNING code_verifier, return_to
  `);

  const consumedRows = consumedResult.rows as Array<{ code_verifier: string; return_to: string | null }>;
  if (consumedRows.length === 0) {
    return c.json({ error: 'Invalid or expired OAuth state' }, 400);
  }

  const consumed = consumedRows[0];

  let accessToken: string;
  try {
    const oauthConfig = getGitHubOAuthConfig();
    accessToken = await exchangeOAuthCode({
      clientId: oauthConfig.clientId,
      clientSecret: oauthConfig.clientSecret,
      redirectUri: oauthConfig.redirectUri,
      code,
      codeVerifier: consumed.code_verifier,
    });
  } catch (err) {
    return c.json(
      {
        error: 'GitHub OAuth code exchange failed',
        detail: err instanceof Error ? err.message : 'unknown_error',
      },
      502,
    );
  }

  let githubUser: { id: number; login: string };
  try {
    githubUser = await fetchAuthenticatedUser(accessToken);
  } catch (err) {
    return c.json(
      {
        error: 'GitHub identity validation failed',
        detail: err instanceof Error ? err.message : 'unknown_error',
      },
      502,
    );
  }

  let credentialId: string;
  try {
    const encryptionKey = requireCredentialEncryptionKey();

    await db.execute(sql`
      UPDATE credentials
      SET status = 'rotated'
      WHERE service = 'github'
        AND key = 'oauth_token'
        AND status = 'active'
        AND identity_id IS NULL
    `);

    const insertResult = await db.execute(sql`
      INSERT INTO credentials (id, identity_id, service, key, encrypted_value, status, created_at, expires_at)
      VALUES (
        gen_random_uuid(),
        NULL,
        'github',
        'oauth_token',
        pgp_sym_encrypt(${accessToken}, ${encryptionKey}, 'cipher-algo=aes256'),
        'active',
        now(),
        NULL
      )
      RETURNING id
    `);

    const insertedRows = insertResult.rows as Array<{ id: string }>;
    if (insertedRows.length === 0) {
      throw new Error('Credential insert did not return an ID');
    }

    credentialId = insertedRows[0]!.id;
  } catch (err) {
    return c.json(
      {
        error: 'Failed to persist encrypted GitHub token',
        detail: err instanceof Error ? err.message : 'unknown_error',
      },
      500,
    );
  }

  const existingSetup = await db.select().from(setupState).limit(1);
  const now = new Date();

  if (existingSetup.length > 0) {
    const row = existingSetup[0]!;
    await db
      .update(setupState)
      .set({
        githubConnected: true,
        githubUserId: String(githubUser.id),
        githubUsername: githubUser.login,
        githubTokenCredentialId: credentialId,
        githubRepoId: null,
        githubRepoFullName: null,
        githubRepoDefaultBranch: null,
        githubRepoValidatedAt: null,
        updatedAt: now,
        setupCompletedAt: null,
      })
      .where(eq(setupState.id, row.id));
  } else {
    await db.insert(setupState).values({
      openrouterKeySet: false,
      githubConnected: true,
      githubUserId: String(githubUser.id),
      githubUsername: githubUser.login,
      githubTokenCredentialId: credentialId,
    });
  }

  await db.delete(oauthState).where(sql`${oauthState.expiresAt} < now() OR ${oauthState.consumedAt} IS NOT NULL`);

  const returnTo = normalizeReturnTo(consumed.return_to);
  const redirectTarget = withQuery(returnTo, { github_oauth: 'connected' });

  return c.redirect(redirectTarget, 302);
});

export default app;
