import { Hono } from 'hono';
import { db, agentState, setupState, eq } from '@jarvis/db';

/**
 * Setup wizard backend routes.
 * All routes require bearer auth (applied in app.ts at the /api/* level).
 *
 * GET  /api/setup           — returns current setup state
 * POST /api/setup/openrouter — validates and stores OpenRouter API key
 * POST /api/setup/github     — marks GitHub as connected (stub — real OAuth TBD)
 * GET  /api/setup/github/callback — placeholder for OAuth callback
 */
const app = new Hono();

/**
 * GET /api/setup
 * Returns the current setup state. If no row exists, returns all-false defaults.
 */
app.get('/', async (c) => {
  const rows = await db.select().from(setupState).limit(1);
  const row = rows[0];

  if (!row) {
    return c.json({
      openrouterKeySet: false,
      githubConnected: false,
      complete: false,
    });
  }

  return c.json({
    openrouterKeySet: row.openrouterKeySet,
    githubConnected: row.githubConnected,
    githubUsername: row.githubUsername ?? null,
    setupCompletedAt: row.setupCompletedAt?.toISOString() ?? null,
    complete: row.openrouterKeySet && row.githubConnected,
  });
});

/**
 * POST /api/setup/openrouter
 * Accepts { apiKey: string }. Validates the key against OpenRouter /v1/models.
 * If valid, stores the key in agentState and marks openrouterKeySet = true.
 */
app.post('/openrouter', async (c) => {
  let body: { apiKey?: string };
  try {
    body = await c.req.json<{ apiKey?: string }>();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { apiKey } = body;
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    return c.json({ error: 'apiKey is required' }, 400);
  }

  const trimmedKey = apiKey.trim();

  // Validate the key by calling OpenRouter /v1/models
  let isValid = false;
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${trimmedKey}` },
    });
    isValid = response.status === 200;
  } catch {
    return c.json({ error: 'Failed to reach OpenRouter — check your network connection' }, 502);
  }

  if (!isValid) {
    return c.json({ error: 'Invalid API key — OpenRouter rejected it' }, 400);
  }

  // Store the API key in agentState (plaintext for now; encrypted if CREDENTIAL_ENCRYPTION_KEY is used)
  const existingKey = await db
    .select()
    .from(agentState)
    .where(eq(agentState.key, 'config:openrouter_api_key'))
    .limit(1);

  if (existingKey.length > 0) {
    await db
      .update(agentState)
      .set({ value: { apiKey: trimmedKey }, updatedAt: new Date() })
      .where(eq(agentState.key, 'config:openrouter_api_key'));
  } else {
    await db
      .insert(agentState)
      .values({ key: 'config:openrouter_api_key', value: { apiKey: trimmedKey } });
  }

  // Update setup state: mark openrouter key as set
  const existingSetup = await db.select().from(setupState).limit(1);

  if (existingSetup.length > 0) {
    const row = existingSetup[0]!;
    const isComplete = true && row.githubConnected; // openrouter is now set
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
 * POST /api/setup/github
 * Accepts { code: string } (OAuth authorization code).
 * For now: stub that marks GitHub as connected with a placeholder username.
 *
 * TODO: Exchange code for access token via GitHub OAuth App
 */
app.post('/github', async (c) => {
  // Stub implementation — marks GitHub as connected
  // When real OAuth is wired, this will exchange the code for a token

  const existingSetup = await db.select().from(setupState).limit(1);

  const username = 'pending-oauth';

  if (existingSetup.length > 0) {
    const row = existingSetup[0]!;
    const isComplete = row.openrouterKeySet && true; // github is now connected
    await db
      .update(setupState)
      .set({
        githubConnected: true,
        githubUsername: username,
        updatedAt: new Date(),
        setupCompletedAt: isComplete ? new Date() : row.setupCompletedAt,
      })
      .where(eq(setupState.id, row.id));
  } else {
    await db.insert(setupState).values({
      openrouterKeySet: false,
      githubConnected: true,
      githubUsername: username,
    });
  }

  return c.json({ success: true, username });
});

/**
 * GET /api/setup/github/callback
 * Placeholder for GitHub OAuth callback — not yet implemented.
 */
app.get('/github/callback', (c) => {
  return c.json({ message: 'GitHub OAuth callback — not yet implemented' });
});

export default app;
