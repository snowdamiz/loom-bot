import { Hono } from 'hono';
import { db, agentState, setupState, oauthState, eq } from '@jarvis/db';
import {
  buildGitHubAuthorizeUrl,
  createOAuthState,
  createPkceChallenge,
  getGitHubOAuthConfig,
  hashOAuthState,
} from './github-oauth-helpers.js';

/**
 * Setup wizard backend routes.
 * All routes under /api/setup require bearer auth (applied in app.ts).
 */
const app = new Hono();

interface SetupStatePayload {
  openrouterKeySet: boolean;
  githubConnected: boolean;
  githubUserId: string | null;
  githubUsername: string | null;
  githubTokenCredentialSet: boolean;
  githubRepoId: string | null;
  githubRepoFullName: string | null;
  githubRepoDefaultBranch: string | null;
  githubRepoValidatedAt: string | null;
  githubTrustBound: boolean;
  setupCompletedAt: string | null;
  complete: boolean;
}

function toSetupStatePayload(row: (typeof setupState.$inferSelect) | undefined): SetupStatePayload {
  if (!row) {
    return {
      openrouterKeySet: false,
      githubConnected: false,
      githubUserId: null,
      githubUsername: null,
      githubTokenCredentialSet: false,
      githubRepoId: null,
      githubRepoFullName: null,
      githubRepoDefaultBranch: null,
      githubRepoValidatedAt: null,
      githubTrustBound: false,
      setupCompletedAt: null,
      complete: false,
    };
  }

  return {
    openrouterKeySet: row.openrouterKeySet,
    githubConnected: row.githubConnected,
    githubUserId: row.githubUserId ?? null,
    githubUsername: row.githubUsername ?? null,
    githubTokenCredentialSet: row.githubTokenCredentialId !== null,
    githubRepoId: row.githubRepoId ?? null,
    githubRepoFullName: row.githubRepoFullName ?? null,
    githubRepoDefaultBranch: row.githubRepoDefaultBranch ?? null,
    githubRepoValidatedAt: row.githubRepoValidatedAt?.toISOString() ?? null,
    githubTrustBound: row.githubRepoFullName !== null && row.githubRepoId !== null,
    setupCompletedAt: row.setupCompletedAt?.toISOString() ?? null,
    complete: row.openrouterKeySet && row.githubConnected,
  };
}

function normalizeReturnTo(rawReturnTo: unknown): string | null {
  if (typeof rawReturnTo !== 'string') {
    return null;
  }

  const trimmed = rawReturnTo.trim();
  if (!trimmed) {
    return null;
  }

  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return null;
  }

  return trimmed;
}

/**
 * GET /api/setup
 * Returns current setup state. If no row exists, returns all-false defaults.
 */
app.get('/', async (c) => {
  const rows = await db.select().from(setupState).limit(1);
  return c.json(toSetupStatePayload(rows[0]));
});

/**
 * POST /api/setup/openrouter
 * Accepts { apiKey: string }. Validates key against OpenRouter /v1/models.
 */
app.post('/openrouter', async (c) => {
  let body: { apiKey?: string };
  try {
    body = await c.req.json<{ apiKey?: string }>();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const apiKey = body.apiKey?.trim();
  if (!apiKey) {
    return c.json({ error: 'apiKey is required' }, 400);
  }

  let isValid = false;
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    isValid = response.status === 200;
  } catch {
    return c.json({ error: 'Failed to reach OpenRouter — check your network connection' }, 502);
  }

  if (!isValid) {
    return c.json({ error: 'Invalid API key — OpenRouter rejected it' }, 400);
  }

  const existingKey = await db
    .select()
    .from(agentState)
    .where(eq(agentState.key, 'config:openrouter_api_key'))
    .limit(1);

  if (existingKey.length > 0) {
    await db
      .update(agentState)
      .set({ value: { apiKey }, updatedAt: new Date() })
      .where(eq(agentState.key, 'config:openrouter_api_key'));
  } else {
    await db
      .insert(agentState)
      .values({ key: 'config:openrouter_api_key', value: { apiKey } });
  }

  const existingSetup = await db.select().from(setupState).limit(1);

  if (existingSetup.length > 0) {
    const row = existingSetup[0]!;
    const isComplete = row.githubConnected;
    await db
      .update(setupState)
      .set({
        openrouterKeySet: true,
        updatedAt: new Date(),
        setupCompletedAt: isComplete ? new Date() : row.setupCompletedAt,
      })
      .where(eq(setupState.id, row.id));
  } else {
    await db.insert(setupState).values({
      openrouterKeySet: true,
      githubConnected: false,
    });
  }

  return c.json({ success: true });
});

/**
 * POST /api/setup/github/start
 * Starts real GitHub OAuth flow with server-managed state + PKCE persistence.
 */
app.post('/github/start', async (c) => {
  let body: { returnTo?: unknown } = {};
  try {
    body = await c.req.json<{ returnTo?: unknown }>();
  } catch {
    // Body is optional. Ignore parse failures and continue without returnTo.
  }

  let oauthConfig;
  try {
    oauthConfig = getGitHubOAuthConfig();
  } catch (err) {
    return c.json(
      {
        error: err instanceof Error ? err.message : 'GitHub OAuth configuration is invalid',
      },
      500,
    );
  }

  const state = createOAuthState();
  const { codeVerifier, codeChallenge } = createPkceChallenge();
  const stateHash = hashOAuthState(state);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await db.insert(oauthState).values({
    stateHash,
    codeVerifier,
    returnTo: normalizeReturnTo(body.returnTo),
    expiresAt,
  });

  const authorizeUrl = buildGitHubAuthorizeUrl({
    clientId: oauthConfig.clientId,
    redirectUri: oauthConfig.redirectUri,
    state,
    codeChallenge,
  });

  return c.json({
    authorizeUrl,
    expiresAt: expiresAt.toISOString(),
  });
});

/**
 * Legacy stub endpoint is intentionally disabled after Phase 10 OAuth rollout.
 */
app.post('/github', async (c) => {
  return c.json(
    {
      error: 'GitHub setup now requires OAuth start + callback. Use POST /api/setup/github/start.',
    },
    410,
  );
});

export default app;
