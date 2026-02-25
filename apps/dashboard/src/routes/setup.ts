import { Hono } from 'hono';
import { db, agentState, setupState, oauthState, eq, sql, ensurePgcryptoExtension } from '@jarvis/db';
import {
  buildGitHubAuthorizeUrl,
  createOAuthState,
  createPkceChallenge,
  fetchAccessibleRepositories,
  fetchRepositoryByFullName,
  hasStoredOrEnvGitHubOAuthConfig,
  hashOAuthState,
  parseOptionalGitHubOAuthConfig,
  resolveGitHubOAuthConfigFromStoreOrEnv,
  upsertStoredGitHubOAuthConfig,
} from './github-oauth-helpers.js';

/**
 * Setup wizard backend routes.
 * All routes under /api/setup require bearer auth (applied in app.ts).
 */
const app = new Hono();

interface SetupStatePayload {
  openrouterKeySet: boolean;
  githubOauthConfigured: boolean;
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

interface RepoSummary {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  defaultBranch: string;
  permissions: {
    admin: boolean;
    push: boolean;
    pull: boolean;
  };
  canBind: boolean;
}

type RouteErrorStatus = 400 | 401 | 403 | 404 | 500;

class RouteError extends Error {
  readonly status: RouteErrorStatus;

  constructor(status: RouteErrorStatus, message: string) {
    super(message);
    this.status = status;
  }
}

function isGitHubTrustBound(row: (typeof setupState.$inferSelect) | undefined): boolean {
  if (!row) {
    return false;
  }

  return row.githubRepoId !== null && row.githubRepoFullName !== null && row.githubRepoDefaultBranch !== null;
}

function isSetupComplete(row: (typeof setupState.$inferSelect) | undefined): boolean {
  if (!row) {
    return false;
  }

  return row.openrouterKeySet && row.githubConnected && isGitHubTrustBound(row);
}

function toSetupStatePayload(
  row: (typeof setupState.$inferSelect) | undefined,
  githubOauthConfigured: boolean,
): SetupStatePayload {
  if (!row) {
    return {
      openrouterKeySet: false,
      githubOauthConfigured,
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
    githubOauthConfigured,
    githubConnected: row.githubConnected,
    githubUserId: row.githubUserId ?? null,
    githubUsername: row.githubUsername ?? null,
    githubTokenCredentialSet: row.githubTokenCredentialId !== null,
    githubRepoId: row.githubRepoId ?? null,
    githubRepoFullName: row.githubRepoFullName ?? null,
    githubRepoDefaultBranch: row.githubRepoDefaultBranch ?? null,
    githubRepoValidatedAt: row.githubRepoValidatedAt?.toISOString() ?? null,
    githubTrustBound: isGitHubTrustBound(row),
    setupCompletedAt: row.setupCompletedAt?.toISOString() ?? null,
    complete: isSetupComplete(row),
  };
}

async function hasStoredOpenRouterKey(): Promise<boolean> {
  const rows = await db
    .select()
    .from(agentState)
    .where(eq(agentState.key, 'config:openrouter_api_key'))
    .limit(1);

  const apiKey = (rows[0]?.value as { apiKey?: string } | undefined)?.apiKey;
  return typeof apiKey === 'string' && apiKey.trim().length > 0;
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

function getCredentialEncryptionKey(): string {
  const key = process.env.CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (!key) {
    throw new RouteError(500, 'CREDENTIAL_ENCRYPTION_KEY is required for GitHub repository trust operations');
  }

  return key;
}

async function getGitHubAuthContext(): Promise<{
  setupRow: typeof setupState.$inferSelect;
  accessToken: string;
}> {
  const setupRows = await db.select().from(setupState).limit(1);
  const setupRow = setupRows[0];

  if (!setupRow || !setupRow.githubConnected) {
    throw new RouteError(400, 'GitHub identity is not connected yet');
  }

  if (!setupRow.githubTokenCredentialId) {
    throw new RouteError(400, 'GitHub token credential reference is missing from setup state');
  }

  const encKey = getCredentialEncryptionKey();
  await ensurePgcryptoExtension(db);
  const tokenResult = await db.execute(sql`
    SELECT pgp_sym_decrypt(encrypted_value, ${encKey}) AS value
    FROM credentials
    WHERE id = ${setupRow.githubTokenCredentialId}
      AND service = 'github'
      AND key = 'oauth_token'
      AND status = 'active'
    LIMIT 1
  `);

  const tokenRows = tokenResult.rows as Array<{ value: string }>;
  if (tokenRows.length === 0 || typeof tokenRows[0]?.value !== 'string' || tokenRows[0].value.length === 0) {
    throw new RouteError(401, 'Active GitHub OAuth token is unavailable. Reconnect GitHub in setup.');
  }

  return {
    setupRow,
    accessToken: tokenRows[0].value,
  };
}

function toRepoSummary(input: {
  id: number;
  name: string;
  full_name: string;
  default_branch: string;
  owner: { login: string };
  permissions?: { admin?: boolean; push?: boolean; pull?: boolean };
}): RepoSummary {
  const admin = Boolean(input.permissions?.admin);
  const push = Boolean(input.permissions?.push);
  const pull = Boolean(input.permissions?.pull);

  return {
    id: input.id,
    name: input.name,
    fullName: input.full_name,
    owner: input.owner.login,
    defaultBranch: input.default_branch,
    permissions: {
      admin,
      push,
      pull,
    },
    canBind: admin || push,
  };
}

/**
 * GET /api/setup
 * Returns current setup state. If no row exists, returns all-false defaults.
 */
app.get('/', async (c) => {
  const [rows, openrouterKeySet, githubOauthConfigured] = await Promise.all([
    db.select().from(setupState).limit(1),
    hasStoredOpenRouterKey(),
    hasStoredOrEnvGitHubOAuthConfig(),
  ]);

  const row = rows[0];
  if (!row) {
    return c.json({
      ...toSetupStatePayload(undefined, githubOauthConfigured),
      openrouterKeySet,
    });
  }

  if (row.openrouterKeySet !== openrouterKeySet) {
    const now = new Date();
    const setupCompletedAt =
      openrouterKeySet && row.githubConnected && isGitHubTrustBound(row) ? (row.setupCompletedAt ?? now) : null;

    await db
      .update(setupState)
      .set({
        openrouterKeySet,
        setupCompletedAt,
        updatedAt: now,
      })
      .where(eq(setupState.id, row.id));

    return c.json(toSetupStatePayload({ ...row, openrouterKeySet, setupCompletedAt, updatedAt: now }, githubOauthConfigured));
  }

  return c.json(toSetupStatePayload(row, githubOauthConfigured));
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
    const now = new Date();
    const isComplete = row.githubConnected && isGitHubTrustBound(row);

    await db
      .update(setupState)
      .set({
        openrouterKeySet: true,
        updatedAt: now,
        setupCompletedAt: isComplete ? now : null,
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
  let body: { returnTo?: unknown; clientId?: unknown; clientSecret?: unknown; redirectUri?: unknown } = {};
  try {
    body = await c.req.json<{ returnTo?: unknown; clientId?: unknown; clientSecret?: unknown; redirectUri?: unknown }>();
  } catch {
    // Body is optional. Ignore parse failures and continue without returnTo.
  }

  const parsedInputConfig = parseOptionalGitHubOAuthConfig({
    clientId: body.clientId,
    clientSecret: body.clientSecret,
    redirectUri: body.redirectUri,
  });

  if (parsedInputConfig.provided && parsedInputConfig.missingFields.length > 0) {
    return c.json(
      {
        error:
          `GitHub OAuth configuration is incomplete. Missing: ${parsedInputConfig.missingFields.join(', ')}`,
      },
      400,
    );
  }

  let oauthConfig = parsedInputConfig.config;
  if (oauthConfig) {
    await upsertStoredGitHubOAuthConfig(oauthConfig);
  } else {
    oauthConfig = await resolveGitHubOAuthConfigFromStoreOrEnv();
  }

  if (!oauthConfig) {
    return c.json(
      {
        error:
          'GitHub OAuth app credentials are required. Provide clientId, clientSecret, and redirectUri in setup.',
      },
      400,
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
 * GET /api/setup/github/repos
 * Lists repos the connected identity can access for trust binding.
 */
app.get('/github/repos', async (c) => {
  try {
    const { setupRow, accessToken } = await getGitHubAuthContext();
    const repos = await fetchAccessibleRepositories(accessToken);

    return c.json({
      repos: repos.map((repo) => toRepoSummary(repo)),
      boundRepoFullName: setupRow.githubRepoFullName ?? null,
    });
  } catch (err) {
    if (err instanceof RouteError) {
      return c.json({ error: err.message }, err.status);
    }

    return c.json({ error: err instanceof Error ? err.message : 'Failed to list repositories' }, 502);
  }
});

/**
 * POST /api/setup/github/bind
 * Persists validated repo trust binding after server-side GitHub permission checks.
 */
app.post('/github/bind', async (c) => {
  let body: { repoFullName?: unknown; repoId?: unknown };
  try {
    body = await c.req.json<{ repoFullName?: unknown; repoId?: unknown }>();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  try {
    const { setupRow, accessToken } = await getGitHubAuthContext();

    const rawRepoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() : '';
    const rawRepoId = typeof body.repoId === 'number' || typeof body.repoId === 'string'
      ? Number(body.repoId)
      : Number.NaN;

    let repoFullName = rawRepoFullName;

    if (!repoFullName && Number.isFinite(rawRepoId)) {
      const repos = await fetchAccessibleRepositories(accessToken);
      const selected = repos.find((repo) => repo.id === rawRepoId);
      if (!selected) {
        throw new RouteError(404, 'Repository not found in accessible repository list');
      }
      repoFullName = selected.full_name;
    }

    if (!repoFullName) {
      throw new RouteError(400, 'repoFullName or repoId is required');
    }

    const repo = await fetchRepositoryByFullName(accessToken, repoFullName);
    const hasWriteAccess = Boolean(repo.permissions?.push) || Boolean(repo.permissions?.admin);

    if (!hasWriteAccess) {
      throw new RouteError(
        403,
        `Repository ${repo.full_name} does not grant push/admin permissions to the connected identity`,
      );
    }

    const now = new Date();
    const isComplete = setupRow.openrouterKeySet && setupRow.githubConnected;

    await db
      .update(setupState)
      .set({
        githubRepoId: String(repo.id),
        githubRepoFullName: repo.full_name,
        githubRepoDefaultBranch: repo.default_branch,
        githubRepoValidatedAt: now,
        updatedAt: now,
        setupCompletedAt: isComplete ? now : null,
      })
      .where(eq(setupState.id, setupRow.id));

    return c.json({
      success: true,
      repo: {
        id: repo.id,
        fullName: repo.full_name,
        defaultBranch: repo.default_branch,
      },
      complete: isComplete,
    });
  } catch (err) {
    if (err instanceof RouteError) {
      return c.json({ error: err.message }, err.status);
    }

    return c.json({ error: err instanceof Error ? err.message : 'Failed to bind repository' }, 502);
  }
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
