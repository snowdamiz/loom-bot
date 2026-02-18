import { Command } from 'commander';
import { db, agentState, killSwitchAudit, eq, shutdown } from '@jarvis/db';

export const resumeCommand = new Command('resume')
  .argument('<reason>', 'Reason for deactivating the kill switch')
  .description('Deactivate the kill switch — resumes agent operations')
  .action(async (reason: string) => {
    const killSwitchValue = {
      active: false,
      reason,
      deactivatedAt: new Date().toISOString(),
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
      action: 'deactivate',
      reason,
      triggeredBy: 'cli',
    });

    console.log(`Kill switch DEACTIVATED. Reason: "${reason}"`);
    console.log('Agent operations can now resume.');

    await shutdown();
    process.exit(0);
  });
