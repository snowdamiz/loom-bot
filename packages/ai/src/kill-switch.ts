import { agentState, killSwitchAudit, eq } from '@jarvis/db';
import type { DbClient } from '@jarvis/db';

/**
 * KILL-02, KILL-04: Kill switch guard.
 * Reads kill switch state from the agent_state table.
 * Caches the result for 1 second to avoid excessive DB queries.
 */

export class KillSwitchActiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KillSwitchActiveError';
  }
}

export class KillSwitchGuard {
  private cachedState: { active: boolean; expiresAt: number } | null = null;
  private readonly TTL_MS = 1000;

  constructor(private readonly db: DbClient) {}

  /**
   * Check if the kill switch is currently active.
   * Uses a 1-second cache to avoid DB round-trips on every AI call.
   */
  async isActive(): Promise<boolean> {
    const now = Date.now();
    if (this.cachedState !== null && now < this.cachedState.expiresAt) {
      return this.cachedState.active;
    }

    const rows = await this.db
      .select()
      .from(agentState)
      .where(eq(agentState.key, 'kill_switch'))
      .limit(1);

    const row = rows[0];
    const value = row?.value as { active?: boolean } | undefined;
    const active = value?.active === true;

    this.cachedState = { active, expiresAt: now + this.TTL_MS };
    return active;
  }

  /**
   * Assert that the kill switch is NOT active.
   * Throws KillSwitchActiveError if kill switch is enabled.
   * Call this before every AI completion.
   */
  async assertActive(): Promise<void> {
    if (await this.isActive()) {
      throw new KillSwitchActiveError('Kill switch is active. No new operations allowed.');
    }
  }

  /**
   * Clear the cached state.
   * Useful in tests to force a fresh DB read.
   */
  clearCache(): void {
    this.cachedState = null;
  }
}

/**
 * KILL-01: Activate the kill switch.
 * Upserts agent_state key='kill_switch' with active=true and inserts an audit record.
 * Used by the CLI and can be called programmatically.
 */
export async function activateKillSwitch(
  db: DbClient,
  reason: string,
  triggeredBy: string = 'cli'
): Promise<void> {
  const killSwitchValue = {
    active: true,
    reason,
    activatedAt: new Date().toISOString(),
  };

  const existing = await db
    .select()
    .from(agentState)
    .where(eq(agentState.key, 'kill_switch'))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(agentState)
      .set({ value: killSwitchValue, updatedAt: new Date() })
      .where(eq(agentState.key, 'kill_switch'));
  } else {
    await db
      .insert(agentState)
      .values({ key: 'kill_switch', value: killSwitchValue });
  }

  await db.insert(killSwitchAudit).values({
    action: 'activate',
    reason,
    triggeredBy,
  });
}

/**
 * KILL-01: Deactivate the kill switch.
 * Upserts agent_state key='kill_switch' with active=false and inserts an audit record.
 * Used by the CLI and can be called programmatically.
 */
export async function deactivateKillSwitch(
  db: DbClient,
  reason: string,
  triggeredBy: string = 'cli'
): Promise<void> {
  const killSwitchValue = {
    active: false,
    reason,
    deactivatedAt: new Date().toISOString(),
  };

  const existing = await db
    .select()
    .from(agentState)
    .where(eq(agentState.key, 'kill_switch'))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(agentState)
      .set({ value: killSwitchValue, updatedAt: new Date() })
      .where(eq(agentState.key, 'kill_switch'));
  } else {
    await db
      .insert(agentState)
      .values({ key: 'kill_switch', value: killSwitchValue });
  }

  await db.insert(killSwitchAudit).values({
    action: 'deactivate',
    reason,
    triggeredBy,
  });
}
