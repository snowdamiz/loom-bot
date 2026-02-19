import { spawn } from 'node:child_process';
import path from 'node:path';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 8_192;
const DEFAULT_FORCE_KILL_AFTER_MS = 1_500;
const DEFAULT_KILL_SIGNAL: NodeJS.Signals = 'SIGTERM';

export type BoundedCommandStatus = 'pass' | 'fail' | 'timeout' | 'error';

export interface RunBoundedCommandInput {
  command: string;
  args?: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  envOverrides?: Record<string, string | undefined>;
  timeoutMs?: number;
  maxOutputBytes?: number;
  killSignal?: NodeJS.Signals;
  forceKillAfterMs?: number;
  nodeMaxOldSpaceSizeMb?: number;
}

export interface BoundedCommandResult {
  status: BoundedCommandStatus;
  command: string[];
  cwd: string;
  timeoutMs: number;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
  stdoutBytes: number;
  stderrBytes: number;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  errorMessage?: string;
}

function appendTail(value: string, chunk: string, maxBytes: number): string {
  if (maxBytes <= 0) {
    return '';
  }

  const combined = value + chunk;
  const combinedBytes = Buffer.byteLength(combined, 'utf8');
  if (combinedBytes <= maxBytes) {
    return combined;
  }

  const buffer = Buffer.from(combined, 'utf8');
  return buffer.subarray(buffer.length - maxBytes).toString('utf8');
}

function buildCommandWithNodeCaps(
  command: string,
  args: string[],
  nodeMaxOldSpaceSizeMb?: number,
): { command: string; args: string[] } {
  if (!nodeMaxOldSpaceSizeMb || nodeMaxOldSpaceSizeMb <= 0) {
    return { command, args };
  }

  const base = path.basename(command).toLowerCase();
  if (base === 'node' || command === process.execPath) {
    return {
      command,
      args: [`--max-old-space-size=${nodeMaxOldSpaceSizeMb}`, ...args],
    };
  }

  return { command, args };
}

function classifyStatus(opts: {
  timedOut: boolean;
  exitCode: number | null;
  spawnError: string | null;
}): BoundedCommandStatus {
  if (opts.spawnError) {
    return 'error';
  }

  if (opts.timedOut) {
    return 'timeout';
  }

  return opts.exitCode === 0 ? 'pass' : 'fail';
}

export async function runBoundedCommand(
  input: RunBoundedCommandInput,
): Promise<BoundedCommandResult> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputBytes = Math.max(0, input.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES);
  const killSignal = input.killSignal ?? DEFAULT_KILL_SIGNAL;
  const forceKillAfterMs = input.forceKillAfterMs ?? DEFAULT_FORCE_KILL_AFTER_MS;
  const args = input.args ?? [];

  const finalized = buildCommandWithNodeCaps(input.command, args, input.nodeMaxOldSpaceSizeMb);
  const commandLine = [finalized.command, ...finalized.args];

  const startedAt = Date.now();
  let stdoutTail = '';
  let stderrTail = '';
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let timedOut = false;
  let spawnError: string | null = null;

  return new Promise<BoundedCommandResult>((resolve) => {
    let settled = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let killHandle: ReturnType<typeof setTimeout> | null = null;

    const finalize = (exitCode: number | null, signal: NodeJS.Signals | null) => {
      if (settled) {
        return;
      }
      settled = true;

      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      if (killHandle) {
        clearTimeout(killHandle);
      }

      resolve({
        status: classifyStatus({ timedOut, exitCode, spawnError }),
        command: commandLine,
        cwd: input.cwd,
        timeoutMs,
        exitCode,
        signal,
        timedOut,
        durationMs: Date.now() - startedAt,
        stdout: stdoutTail,
        stderr: stderrTail,
        stdoutBytes,
        stderrBytes,
        stdoutTruncated: stdoutBytes > maxOutputBytes,
        stderrTruncated: stderrBytes > maxOutputBytes,
        errorMessage: spawnError ?? undefined,
      });
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(finalized.command, finalized.args, {
        cwd: input.cwd,
        env: {
          ...input.env,
          ...input.envOverrides,
        },
        shell: false,
      });
    } catch (error) {
      spawnError = error instanceof Error ? error.message : String(error);
      finalize(null, null);
      return;
    }

    child.stdout?.on('data', (chunk: Buffer | string) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      stdoutBytes += Buffer.byteLength(text, 'utf8');
      stdoutTail = appendTail(stdoutTail, text, maxOutputBytes);
    });

    child.stderr?.on('data', (chunk: Buffer | string) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      stderrBytes += Buffer.byteLength(text, 'utf8');
      stderrTail = appendTail(stderrTail, text, maxOutputBytes);
    });

    child.on('error', (error) => {
      spawnError = error.message;
      finalize(null, null);
    });

    child.on('close', (exitCode, signal) => {
      finalize(exitCode, signal);
    });

    timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill(killSignal);
      killHandle = setTimeout(() => {
        child.kill('SIGKILL');
      }, forceKillAfterMs);
    }, timeoutMs);
  });
}
