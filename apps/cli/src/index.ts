#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import { killCommand } from './commands/kill.js';
import { resumeCommand } from './commands/resume.js';

const program = new Command();

program
  .name('jarvis')
  .description('Jarvis agent control CLI')
  .version('0.1.0');

program.addCommand(killCommand);
program.addCommand(resumeCommand);

await program.parseAsync(process.argv);
