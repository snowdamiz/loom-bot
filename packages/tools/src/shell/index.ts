import { spawn } from 'node:child_process';
import { z } from 'zod';
import type { ToolDefinition } from '../types.js';

/**
 * TOOL-01: Shell command execution tool.
 *
 * Executes commands via child_process.spawn (NOT shell: true — avoids shell injection
 * even in unrestricted mode, since the agent generates commands programmatically).
 *
 * Output: Full stdout, stderr, and exit code.
 * The shell tool itself NEVER truncates output — per locked decision:
 * "Log everything: complete shell output. Storage is cheap, missing data is not recoverable."
 * Truncation for LLM context protection is handled by invoke.ts AFTER full logging.
 *
 * maxOutputBytes: 10MB — applied by invoke.ts to the ToolResult only, not to tool output.
 */

const inputSchema = z.object({
  command: z.string().min(1, 'command cannot be empty'),
  args: z.array(z.string()).optional().default([]),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
});

type ShellInput = z.infer<typeof inputSchema>;

interface ShellOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export const shellTool: ToolDefinition<ShellInput, ShellOutput> = {
  name: 'shell',
  description:
    'Execute a shell command and return stdout, stderr, and exit code. ' +
    'command is the executable; args is the argument array. ' +
    'Never uses shell: true — pass arguments as an array to avoid injection.',
  inputSchema,
  timeoutMs: 30_000,
  maxOutputBytes: 10_485_760, // 10MB — applied by invoke.ts after full logging

  async execute(input: ShellInput, signal: AbortSignal): Promise<ShellOutput> {
    return new Promise<ShellOutput>((resolve, reject) => {
      const child = spawn(input.command, input.args, {
        cwd: input.cwd,
        env: input.env ? { ...process.env, ...input.env } : process.env,
        shell: false, // Security: never use shell — prevents injection from agent commands
        signal, // AbortSignal integration: child process killed when signal fires
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutChunks.push(chunk);
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });

      child.on('error', (err: NodeJS.ErrnoException) => {
        // Distinguish abort (timeout) from other errors
        if (err.name === 'AbortError' || signal.aborted) {
          reject(err);
        } else {
          reject(new Error(`spawn error: ${err.message}`));
        }
      });

      child.on('close', (code: number | null, _signal: NodeJS.Signals | null) => {
        resolve({
          stdout: Buffer.concat(stdoutChunks as unknown as Uint8Array[]).toString('utf-8'),
          stderr: Buffer.concat(stderrChunks as unknown as Uint8Array[]).toString('utf-8'),
          exitCode: code,
        });
      });
    });
  },
};
