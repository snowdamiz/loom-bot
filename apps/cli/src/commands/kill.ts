import { Command } from 'commander';
import { db, agentState, killSwitchAudit, eq, shutdown } from '@jarvis/db';

export const killCommand = new Command('kill')
  .argument('<reason>', 'Reason for activating the kill switch')
  .description('Activate the kill switch — halts all new agent operations')
  .action(async (reason: string) => {
    const killSwitchValue = {
      active: true,
      reason,
      activatedAt: new Date().toISOString(),
    };

    // Upsert agent_state key='kill_switch'
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

    // Insert audit record
    await db.insert(killSwitchAudit).values({
      action: 'activate',
      reason,
      triggeredBy: 'cli',
    });

    console.log(`Kill switch ACTIVATED. Reason: "${reason}"`);
    console.log('All new agent operations are now halted.');

    await shutdown();
    process.exit(0);
  });
