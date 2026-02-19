import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createAuthMiddleware } from './middleware/auth.js';
import statusRoute from './routes/status.js';
import killSwitchRoute from './routes/kill-switch.js';
import pnlRoute from './routes/pnl.js';
import activityRoute from './routes/activity.js';
import sseRoute from './routes/sse.js';

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

export default app;
