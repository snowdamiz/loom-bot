import { Command } from 'commander';
import { db, shutdown } from '@jarvis/db';
import { deactivateKillSwitch } from '@jarvis/ai';

export const resumeCommand = new Command('resume')
  .argument('<reason>', 'Reason for deactivating the kill switch')
  .description('Deactivate the kill switch — resumes agent operations')
  .action(async (reason: string) => {
    await deactivateKillSwitch(db, reason, 'cli');

    console.log(`Kill switch DEACTIVATED. Reason: "${reason}"`);
    console.log('Agent operations can now resume.');

    await shutdown();
    process.exit(0);
  });
