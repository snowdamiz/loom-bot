import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { db } from '@jarvis/db';
import app from './app.js';
import { startPoller } from './poller.js';

/**
 * DASH-01: Dashboard server entry point.
 * Starts the Hono API server on DASHBOARD_PORT (default 3001).
 * Mounts static file serving for SPA after API routes.
 * Starts DB poller for SSE real-time updates.
 */

const PORT = parseInt(process.env.DASHBOARD_PORT ?? '3001', 10);

// Mount static file serving AFTER API routes to avoid catching /api/* requests
app.use('/*', serveStatic({ root: './public' }));

// SPA fallback — serve index.html for all non-API routes
app.get('/*', serveStatic({ path: './public/index.html' }));

// Start DB poller
const pollerInterval = startPoller(db);

// Start server
serve({ fetch: app.fetch, port: PORT });
process.stderr.write(`[dashboard] Server listening on port ${PORT}\n`);

// Graceful shutdown
const shutdown = (): void => {
  process.stderr.write('[dashboard] Shutting down...\n');
  clearInterval(pollerInterval);
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
