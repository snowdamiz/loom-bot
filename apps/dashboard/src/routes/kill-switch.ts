import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '@jarvis/db';
import { activateKillSwitch, deactivateKillSwitch } from '@jarvis/ai';
import { broadcaster } from '../broadcaster.js';

/**
 * DASH-04: Kill switch control endpoint.
 * Activates or deactivates the kill switch and emits SSE update.
 */
const app = new Hono();

const killSwitchSchema = z.object({
  action: z.enum(['activate', 'deactivate']),
  reason: z.string().min(1).max(500),
});

app.post('/', zValidator('json', killSwitchSchema), async (c) => {
  const { action, reason } = c.req.valid('json');

  if (action === 'activate') {
    await activateKillSwitch(db, reason, 'dashboard');
  } else {
    await deactivateKillSwitch(db, reason, 'dashboard');
  }

  // Emit SSE update for immediate push to connected clients
  broadcaster.emit('update', 'status', { killSwitchAction: action });

  return c.json({ ok: true, action });
});

export default app;
