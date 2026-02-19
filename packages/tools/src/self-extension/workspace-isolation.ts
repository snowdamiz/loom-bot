import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_TEMP_ROOT = path.join(os.tmpdir(), 'jarvis-sext-worktrees');
const OUTPUT_TAIL_LIMIT = 4_096;

export type WorktreeIsolationFailureCategory = 'infra' | 'setup' | 'cleanup';

export type WorktreeIsolationOperation =
  | 'prepare-temp-root'
  | 'prepare-worktree-path'
  | 'create-worktree'
  | 'remove-worktree'
  | 'prune-worktrees';

export interface WorktreeIsolationErrorDetails {
  category: WorktreeIsolationFailureCategory;
  operation: WorktreeIsolationOperation;
  repoRoot: string;
  worktreePath?: string;
  baseRef?: string;
  command?: string[];
  timeoutMs?: number;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  stdoutTail?: string;
  stderrTail?: string;
  timedOut?: boolean;
}

export class WorktreeIsolationError extends Error {
  readonly details: WorktreeIsolationErrorDetails;

  constructor(message: string, details: WorktreeIsolationErrorDetails) {
    super(message);
    this.name = 'WorktreeIsolationError';
    this.details = details;
  }
}

export interface CreateIsolatedWorktreeInput {
  repoRoot: string;
  baseRef: string;
  runId?: string;
  tempRoot?: string;
  timeoutMs?: number;
}

export interface IsolatedWorktreeHandle {
  runId: string;
  repoRoot: string;
  baseRef: string;
  tempRoot: string;
  worktreePath: string;
  createdAt: string;
}

export interface CleanupIsolatedWorktreeInput {
  repoRoot: string;
  worktreePath: string;
  timeoutMs?: number;
  prune?: boolean;
}

export interface CleanupIsolatedWorktreeResult {
  removed: boolean;
  pruned: boolean;
  warnings: string[];
}

interface GitCommandResult {
  ok: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  stdoutTail: string;
  stderrTail: string;
}

function sanitizeRunId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return randomUUID();
  }

  return trimmed
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .slice(0, 96) || randomUUID();
}

function trimTail(value: string, maxChars = OUTPUT_TAIL_LIMIT): string {
  if (value.length <= maxChars) {
    return value;
  }
  return value.slice(value.length - maxChars);
}

async function runGitWorktreeCommand(opts: {
  repoRoot: string;
  command: string[];
  timeoutMs: number;
}): Promise<GitCommandResult> {
  return new Promise<GitCommandResult>((resolve) => {
    const [binary, ...args] = opts.command;
    if (!binary) {
      resolve({
        ok: false,
        exitCode: null,
        signal: null,
        timedOut: false,
        stdoutTail: '',
        stderrTail: 'Missing command binary',
      });
      return;
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(binary, args, {
        cwd: opts.repoRoot,
        env: process.env,
        shell: false,
      });
    } catch (error) {
      resolve({
        ok: false,
        exitCode: null,
        signal: null,
        timedOut: false,
        stdoutTail: '',
        stderrTail: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    const finish = (result: GitCommandResult) => {
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
      resolve(result);
    };

    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      stdout = trimTail(stdout);
    });

    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      stderr = trimTail(stderr);
    });

    child.on('error', (error) => {
      finish({
        ok: false,
        exitCode: null,
        signal: null,
        timedOut,
        stdoutTail: stdout,
        stderrTail: trimTail(`${stderr}\n${error.message}`.trim()),
      });
    });

    child.on('close', (exitCode, signal) => {
      finish({
        ok: exitCode === 0 && !timedOut,
        exitCode,
        signal,
        timedOut,
        stdoutTail: stdout,
        stderrTail: stderr,
      });
    });

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      killHandle = setTimeout(() => {
        child.kill('SIGKILL');
      }, 1_500);
    }, opts.timeoutMs);

    let killHandle: ReturnType<typeof setTimeout> | null = null;
  });
}

function toIsolationError(message: string, details: WorktreeIsolationErrorDetails): WorktreeIsolationError {
  return new WorktreeIsolationError(message, details);
}

export async function createIsolatedWorktree(
  input: CreateIsolatedWorktreeInput,
): Promise<IsolatedWorktreeHandle> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const runId = sanitizeRunId(input.runId ?? randomUUID());
  const tempRoot = path.resolve(input.tempRoot ?? DEFAULT_TEMP_ROOT);
  const worktreePath = path.join(tempRoot, runId);

  try {
    mkdirSync(tempRoot, { recursive: true });
  } catch (error) {
    throw toIsolationError('Failed to prepare isolated worktree temp root', {
      category: 'infra',
      operation: 'prepare-temp-root',
      repoRoot: input.repoRoot,
      worktreePath,
      baseRef: input.baseRef,
      stderrTail: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    rmSync(worktreePath, { recursive: true, force: true });
  } catch (error) {
    throw toIsolationError('Failed to clear existing isolated worktree path', {
      category: 'infra',
      operation: 'prepare-worktree-path',
      repoRoot: input.repoRoot,
      worktreePath,
      baseRef: input.baseRef,
      stderrTail: error instanceof Error ? error.message : String(error),
    });
  }

  const command = ['git', 'worktree', 'add', '--detach', worktreePath, input.baseRef];
  const result = await runGitWorktreeCommand({
    repoRoot: input.repoRoot,
    command,
    timeoutMs,
  });

  if (!result.ok) {
    throw toIsolationError('Failed to create isolated git worktree', {
      category: 'setup',
      operation: 'create-worktree',
      repoRoot: input.repoRoot,
      worktreePath,
      baseRef: input.baseRef,
      command,
      timeoutMs,
      exitCode: result.exitCode,
      signal: result.signal,
      timedOut: result.timedOut,
      stdoutTail: result.stdoutTail,
      stderrTail: result.stderrTail,
    });
  }

  return {
    runId,
    repoRoot: input.repoRoot,
    baseRef: input.baseRef,
    tempRoot,
    worktreePath,
    createdAt: new Date().toISOString(),
  };
}

function isAlreadyRemovedError(stderr: string): boolean {
  const normalized = stderr.toLowerCase();
  return (
    normalized.includes('is not a working tree') ||
    normalized.includes('is not a working tree entry') ||
    normalized.includes('no such file or directory')
  );
}

export async function cleanupIsolatedWorktree(
  input: CleanupIsolatedWorktreeInput,
): Promise<CleanupIsolatedWorktreeResult> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const warnings: string[] = [];

  const removeCommand = ['git', 'worktree', 'remove', '--force', input.worktreePath];
  const removeResult = await runGitWorktreeCommand({
    repoRoot: input.repoRoot,
    command: removeCommand,
    timeoutMs,
  });

  let removed = removeResult.ok;
  if (!removeResult.ok) {
    if (removeResult.stderrTail && isAlreadyRemovedError(removeResult.stderrTail)) {
      removed = false;
      warnings.push(
        `Worktree already absent during cleanup: ${removeResult.stderrTail.trim()}`,
      );
    } else {
      throw toIsolationError('Failed to remove isolated git worktree', {
        category: 'cleanup',
        operation: 'remove-worktree',
        repoRoot: input.repoRoot,
        worktreePath: input.worktreePath,
        command: removeCommand,
        timeoutMs,
        exitCode: removeResult.exitCode,
        signal: removeResult.signal,
        timedOut: removeResult.timedOut,
        stdoutTail: removeResult.stdoutTail,
        stderrTail: removeResult.stderrTail,
      });
    }
  }

  try {
    rmSync(input.worktreePath, { recursive: true, force: true });
  } catch (error) {
    warnings.push(
      `Unable to clear local worktree directory: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let pruned = false;
  if (input.prune !== false) {
    const pruneCommand = ['git', 'worktree', 'prune'];
    const pruneResult = await runGitWorktreeCommand({
      repoRoot: input.repoRoot,
      command: pruneCommand,
      timeoutMs,
    });

    if (!pruneResult.ok) {
      throw toIsolationError('Failed to prune git worktree metadata', {
        category: 'cleanup',
        operation: 'prune-worktrees',
        repoRoot: input.repoRoot,
        worktreePath: input.worktreePath,
        command: pruneCommand,
        timeoutMs,
        exitCode: pruneResult.exitCode,
        signal: pruneResult.signal,
        timedOut: pruneResult.timedOut,
        stdoutTail: pruneResult.stdoutTail,
        stderrTail: pruneResult.stderrTail,
      });
    }

    pruned = true;
  }

  return {
    removed,
    pruned,
    warnings,
  };
}
