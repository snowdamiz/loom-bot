import { Hono } from 'hono';
import { db, agentState, goals, eq } from '@jarvis/db';

/**
 * DASH-03: Agent status endpoint.
 * Returns kill switch state, system status, active goals, and uptime.
 */
const app = new Hono();

app.get('/', async (c) => {
  // Query kill_switch state
  const killSwitchRows = await db
    .select()
    .from(agentState)
    .where(eq(agentState.key, 'kill_switch'))
    .limit(1);

  // Query system:status state
  const systemStatusRows = await db
    .select()
    .from(agentState)
    .where(eq(agentState.key, 'system:status'))
    .limit(1);

  // Query active goals
  const activeGoals = await db
    .select()
    .from(goals)
    .where(eq(goals.status, 'active'));

  const killSwitchValue = killSwitchRows[0]?.value as {
    active?: boolean;
    reason?: string;
    activatedAt?: string;
  } | undefined;

  const systemStatusValue = systemStatusRows[0]?.value as {
    status?: string;
    startedAt?: string;
  } | undefined;

  // Compute uptime from startedAt if available
  let uptime: number | null = null;
  if (systemStatusValue?.startedAt) {
    const startedAt = new Date(systemStatusValue.startedAt);
    if (!isNaN(startedAt.getTime())) {
      uptime = Math.floor((Date.now() - startedAt.getTime()) / 1000);
    }
  }

  return c.json({
    isHalted: killSwitchValue?.active === true,
    haltReason: killSwitchValue?.reason ?? null,
    activatedAt: killSwitchValue?.activatedAt ?? null,
    systemStatus: systemStatusValue?.status ?? 'unknown',
    activeGoals: activeGoals.map((g) => ({
      id: g.id,
      description: g.description,
      priority: g.priority,
    })),
    uptime,
  });
});

export default app;
