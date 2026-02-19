import { Hono } from 'hono';
import { db, identities, identityAccounts, credentials, credentialAccessAudit, eq, sql, and } from '@jarvis/db';

/**
 * IDENT-06: Identity ledger API routes for operator audit.
 *
 * Routes:
 *   GET /identities           — list all identities with pagination + optional status filter
 *   GET /identities/:id/accounts — list accounts, credentials (metadata only), and audit log
 *
 * This lets the operator audit all browser identities created by the agent,
 * the service accounts attached to each identity, and every credential access event.
 */

const app = new Hono();

/**
 * GET /identities
 *
 * List all identities with pagination and optional status filter.
 *
 * Query params:
 *   limit  — number of results per page (default 50, max 200)
 *   offset — pagination offset (default 0)
 *   status — optional filter: 'active' | 'suspended' | 'retired' | 'archived'
 *
 * Returns: { identities: [...], total: number }
 */
app.get('/identities', async (c) => {
  const limitParam = c.req.query('limit');
  const offsetParam = c.req.query('offset');
  const statusParam = c.req.query('status');

  const limit = Math.min(Math.max(parseInt(limitParam ?? '50', 10) || 50, 1), 200);
  const offset = Math.max(parseInt(offsetParam ?? '0', 10) || 0, 0);

  // Build count and list queries (with optional status filter)
  if (statusParam) {
    const validStatuses = ['active', 'suspended', 'retired', 'archived'];
    if (!validStatuses.includes(statusParam)) {
      return c.json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, 400);
    }
  }

  // Count total (for pagination metadata)
  const countResult = statusParam
    ? await db
        .select({ count: sql<number>`count(*)::integer` })
        .from(identities)
        .where(eq(identities.status, statusParam))
    : await db.select({ count: sql<number>`count(*)::integer` }).from(identities);

  const total = countResult[0]?.count ?? 0;

  // Fetch page
  const rows = statusParam
    ? await db
        .select({
          id: identities.id,
          name: identities.name,
          email: identities.email,
          status: identities.status,
          riskScore: identities.riskScore,
          createdAt: identities.createdAt,
          retiredAt: identities.retiredAt,
        })
        .from(identities)
        .where(eq(identities.status, statusParam))
        .orderBy(sql`${identities.createdAt} DESC`)
        .limit(limit)
        .offset(offset)
    : await db
        .select({
          id: identities.id,
          name: identities.name,
          email: identities.email,
          status: identities.status,
          riskScore: identities.riskScore,
          createdAt: identities.createdAt,
          retiredAt: identities.retiredAt,
        })
        .from(identities)
        .orderBy(sql`${identities.createdAt} DESC`)
        .limit(limit)
        .offset(offset);

  return c.json({
    identities: rows,
    total,
  });
});

/**
 * GET /identities/:id/accounts
 *
 * Retrieve full audit context for a single identity:
 *   - Identity record
 *   - All service accounts (identity_accounts)
 *   - All credentials metadata (NO encrypted values — id, service, key, status, dates only)
 *   - Last 100 credential access audit entries
 *
 * Returns: { identity, accounts, credentials, auditLog }
 */
app.get('/identities/:id/accounts', async (c) => {
  const identityId = c.req.param('id');

  // Fetch identity record
  const identityRows = await db
    .select()
    .from(identities)
    .where(eq(identities.id, identityId))
    .limit(1);

  if (identityRows.length === 0) {
    return c.json({ error: 'Identity not found' }, 404);
  }

  const identity = identityRows[0];

  // Fetch all service accounts for this identity
  const accounts = await db
    .select()
    .from(identityAccounts)
    .where(eq(identityAccounts.identityId, identityId))
    .orderBy(sql`${identityAccounts.createdAt} DESC`);

  // Fetch credential metadata (NEVER return encryptedValue)
  const credentialRows = await db
    .select({
      id: credentials.id,
      service: credentials.service,
      key: credentials.key,
      status: credentials.status,
      createdAt: credentials.createdAt,
      expiresAt: credentials.expiresAt,
    })
    .from(credentials)
    .where(eq(credentials.identityId, identityId))
    .orderBy(sql`${credentials.createdAt} DESC`);

  // Fetch last 100 credential access audit entries for this identity
  const auditLog = await db
    .select()
    .from(credentialAccessAudit)
    .where(eq(credentialAccessAudit.identityId, identityId))
    .orderBy(sql`${credentialAccessAudit.accessedAt} DESC`)
    .limit(100);

  return c.json({
    identity,
    accounts,
    credentials: credentialRows,
    auditLog,
  });
});

export default app;
