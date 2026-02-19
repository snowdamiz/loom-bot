import { bearerAuth } from 'hono/bearer-auth';
import type { MiddlewareHandler } from 'hono';

/**
 * DASH-02: Bearer token authentication middleware.
 * Reads DASHBOARD_TOKEN from environment. Fails fast at startup if not set.
 * Uses hono/bearer-auth for token comparison.
 */
export function createAuthMiddleware(): MiddlewareHandler {
  const token = process.env.DASHBOARD_TOKEN;
  if (!token) {
    throw new Error('DASHBOARD_TOKEN environment variable is required but not set');
  }

  return bearerAuth({
    verifyToken: async (incoming) => incoming === token,
  });
}
