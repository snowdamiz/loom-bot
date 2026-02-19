import type { BoundedCommandResult, BoundedCommandStatus } from './bounded-command.js';

export type VerificationStageStatus = 'pass' | 'fail' | 'timeout' | 'error' | 'skipped';

export type VerificationRunStatus = 'pass' | 'fail' | 'timeout' | 'error';

export type VerificationFailureCategory =
  | 'compile'
  | 'test'
  | 'startup'
  | 'timeout'
  | 'infra'
  | 'setup'
  | 'unknown';

export interface VerificationWorkspaceSummary {
  path: string;
  isolated: boolean;
  baseRef?: string;
}

export interface VerificationFailureSummary {
  category: VerificationFailureCategory;
  reason: string;
  stage?: string;
}

export interface VerificationStageCommand {
  command: string[];
  cwd: string;
  timeoutMs: number;
}

export interface VerificationStageResourceSummary {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  stdoutBytes: number;
  stderrBytes: number;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
}

export interface VerificationStageResult {
  name: string;
  status: VerificationStageStatus;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  command?: VerificationStageCommand;
  stdoutTail?: string;
  stderrTail?: string;
  resource?: VerificationStageResourceSummary;
  failureCategory?: VerificationFailureCategory;
  failureReason?: string;
}

export interface VerificationRunResult {
  runId: string;
  overallStatus: VerificationRunStatus;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  workspace: VerificationWorkspaceSummary;
  stages: VerificationStageResult[];
  failure?: VerificationFailureSummary;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toTimestamp(value: Date | string): number {
  return value instanceof Date ? value.getTime() : Date.parse(value);
}

export function boundedStatusToVerificationStatus(
  status: BoundedCommandStatus,
): VerificationStageStatus {
  switch (status) {
    case 'pass':
      return 'pass';
    case 'timeout':
      return 'timeout';
    case 'error':
      return 'error';
    case 'fail':
    default:
      return 'fail';
  }
}

export function inferFailureCategoryFromStage(opts: {
  stageName: string;
  status: VerificationStageStatus;
  fallback?: VerificationFailureCategory;
}): VerificationFailureCategory | undefined {
  if (opts.status === 'pass' || opts.status === 'skipped') {
    return undefined;
  }

  if (opts.status === 'timeout') {
    return 'timeout';
  }

  const name = opts.stageName.toLowerCase();
  if (name.includes('compile') || name.includes('build')) {
    return 'compile';
  }
  if (name.includes('test')) {
    return 'test';
  }
  if (name.includes('startup') || name.includes('smoke') || name.includes('boot')) {
    return 'startup';
  }

  return opts.fallback ?? 'unknown';
}

export function buildVerificationStageResultFromCommand(opts: {
  stageName: string;
  startedAt: Date | string;
  finishedAt?: Date | string;
  boundedResult: BoundedCommandResult;
  failureReason?: string;
  failureCategory?: VerificationFailureCategory;
}): VerificationStageResult {
  const startedAtIso = toIsoString(opts.startedAt);
  const endedAtIso = toIsoString(
    opts.finishedAt ?? new Date(toTimestamp(opts.startedAt) + opts.boundedResult.durationMs),
  );
  const status = boundedStatusToVerificationStatus(opts.boundedResult.status);
  const failureCategory =
    opts.failureCategory ??
    inferFailureCategoryFromStage({
      stageName: opts.stageName,
      status,
    });

  return {
    name: opts.stageName,
    status,
    startedAt: startedAtIso,
    endedAt: endedAtIso,
    durationMs: opts.boundedResult.durationMs,
    command: {
      command: opts.boundedResult.command,
      cwd: opts.boundedResult.cwd,
      timeoutMs: opts.boundedResult.timeoutMs,
    },
    stdoutTail: opts.boundedResult.stdout,
    stderrTail: opts.boundedResult.stderr,
    resource: {
      exitCode: opts.boundedResult.exitCode,
      signal: opts.boundedResult.signal,
      timedOut: opts.boundedResult.timedOut,
      stdoutBytes: opts.boundedResult.stdoutBytes,
      stderrBytes: opts.boundedResult.stderrBytes,
      stdoutTruncated: opts.boundedResult.stdoutTruncated,
      stderrTruncated: opts.boundedResult.stderrTruncated,
    },
    failureCategory,
    failureReason:
      opts.failureReason ??
      opts.boundedResult.errorMessage ??
      (status === 'pass' ? undefined : opts.boundedResult.stderr || 'Verification stage failed'),
  };
}

export function deriveVerificationRunStatus(
  stages: VerificationStageResult[],
): VerificationRunStatus {
  if (stages.some((stage) => stage.status === 'timeout')) {
    return 'timeout';
  }

  if (stages.some((stage) => stage.status === 'error')) {
    return 'error';
  }

  if (stages.some((stage) => stage.status === 'fail')) {
    return 'fail';
  }

  return 'pass';
}

export function buildVerificationRunResult(opts: {
  runId: string;
  startedAt: Date | string;
  endedAt?: Date | string;
  workspace: VerificationWorkspaceSummary;
  stages: VerificationStageResult[];
  failure?: VerificationFailureSummary;
}): VerificationRunResult {
  const startedAtIso = toIsoString(opts.startedAt);
  const endedAtIso = toIsoString(opts.endedAt ?? new Date());
  const durationMs = Math.max(0, toTimestamp(endedAtIso) - toTimestamp(startedAtIso));
  const overallStatus = deriveVerificationRunStatus(opts.stages);

  const firstFailedStage = opts.stages.find((stage) => stage.status !== 'pass' && stage.status !== 'skipped');
  const failure: VerificationFailureSummary | undefined =
    opts.failure ??
    (firstFailedStage
      ? {
          category: firstFailedStage.failureCategory ?? 'unknown',
          reason: firstFailedStage.failureReason ?? 'Verification stage failed',
          stage: firstFailedStage.name,
        }
      : undefined);

  return {
    runId: opts.runId,
    overallStatus,
    startedAt: startedAtIso,
    endedAt: endedAtIso,
    durationMs,
    workspace: opts.workspace,
    stages: opts.stages,
    failure,
  };
}
