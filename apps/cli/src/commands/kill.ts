import { Command } from 'commander';
import { db, shutdown } from '@jarvis/db';
import { activateKillSwitch } from '@jarvis/ai';

export const killCommand = new Command('kill')
  .argument('<reason>', 'Reason for activating the kill switch')
  .description('Activate the kill switch — halts all new agent operations')
  .action(async (reason: string) => {
    await activateKillSwitch(db, reason, 'cli');

    console.log(`Kill switch ACTIVATED. Reason: "${reason}"`);
    console.log('All new agent operations are now halted.');

    await shutdown();
    process.exit(0);
  });
