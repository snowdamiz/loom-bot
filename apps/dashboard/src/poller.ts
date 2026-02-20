import type { DbClient } from '@jarvis/db';
import { agentState, goals, toolCalls, decisionLog, eq, desc } from '@jarvis/db';
import { broadcaster } from './broadcaster.js';
import { readSelfExtensionSnapshot } from './routes/self-extension.js';

/**
 * DASH-07: DB poller for SSE real-time updates.
 * Polls the DB on an interval and emits updates to the broadcaster.
 * Errors are non-fatal: logged to stderr, never crash the poller.
 */
export function startPoller(db: DbClient, intervalMs = 2000): NodeJS.Timeout {
  const poll = async (): Promise<void> => {
    try {
      // Query kill switch and system status
      const killSwitchRows = await db
        .select()
        .from(agentState)
        .where(eq(agentState.key, 'kill_switch'))
        .limit(1);

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

      const statusPayload = {
        isHalted: killSwitchValue?.active === true,
        haltReason: killSwitchValue?.reason ?? null,
        activatedAt: killSwitchValue?.activatedAt ?? null,
        systemStatus: systemStatusValue?.status ?? 'unknown',
        activeGoals: activeGoals.map((g) => ({
          id: g.id,
          description: g.description,
          priority: g.priority,
        })),
      };

      broadcaster.emit('update', 'status', statusPayload);

      const selfExtensionSnapshot = await readSelfExtensionSnapshot();
      broadcaster.emit('update', 'self_extension', selfExtensionSnapshot);

      // Query latest tool calls (last 5 by id DESC)
      const latestToolCalls = await db
        .select()
        .from(toolCalls)
        .orderBy(desc(toolCalls.id))
        .limit(5);

      // Query latest decision log entry
      const latestDecisions = await db
        .select()
        .from(decisionLog)
        .orderBy(desc(decisionLog.id))
        .limit(1);

      broadcaster.emit('update', 'activity', {
        toolCalls: latestToolCalls,
        decisions: latestDecisions,
      });
    } catch (err) {
      process.stderr.write(`[poller] Error during poll cycle: ${String(err)}\n`);
    }
  };

  // Run immediately, then on interval
  void poll();
  return setInterval(() => {
    void poll();
  }, intervalMs);
}
