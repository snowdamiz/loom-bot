import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createAuthMiddleware } from './middleware/auth.js';
import statusRoute from './routes/status.js';
import killSwitchRoute from './routes/kill-switch.js';
import pnlRoute from './routes/pnl.js';
import activityRoute from './routes/activity.js';
import sseRoute from './routes/sse.js';
import identitiesRoute from './routes/identities.js';
import apiRoute from './routes/api.js';
import setupRoute from './routes/setup.js';
import githubOAuthCallbackRoute from './routes/github-oauth-callback.js';
import chatRoute from './routes/chat.js';
import selfExtensionRoute from './routes/self-extension.js';

/**
 * DASH-01: Hono app factory with middleware and routes.
 * Applies CORS and auth middleware to /api/* paths.
 */
const app = new Hono();

// CORS middleware for API routes — allow Authorization and Content-Type headers
app.use(
  '/api/*',
  cors({
    origin: '*',
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  }),
);

// Bearer auth middleware for all API routes
app.use('/api/*', createAuthMiddleware());

// Mount REST routes
app.route('/api/status', statusRoute);
app.route('/api/kill-switch', killSwitchRoute);
app.route('/api/activity', activityRoute);
app.route('/api/pnl', pnlRoute);
app.route('/api/sse', sseRoute);
// Phase 6: Identity ledger (IDENT-06 — operator audit of browser identities)
app.route('/api', identitiesRoute);
// Phase 7: Strategy engine — goal seeding + strategy listing
app.route('/api', apiRoute);
// Setup wizard: GET/POST /api/setup/* for operator onboarding flow
app.route('/api/setup', setupRoute);
// Public OAuth callback (must stay outside /api bearer middleware)
app.route('/setup/github', githubOAuthCallbackRoute);
// Sidebar chat: POST /api/chat + GET /api/chat/history
app.route('/api/chat', chatRoute);
// Self-extension status + promotion pause controls
app.route('/api/self-extension', selfExtensionRoute);

export default app;
