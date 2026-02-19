import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runBoundedCommand } from './bounded-command.js';
import {
  buildVerificationRunResult,
  buildVerificationStageResultFromCommand,
  type VerificationFailureCategory,
  type VerificationRunResult,
  type VerificationStageResult,
} from './verification-diagnostics.js';
import {
  buildVerificationPlan,
  REQUIRED_VERIFICATION_STAGES,
} from './verification-policy.js';
import {
  WorktreeIsolationError,
  cleanupIsolatedWorktree,
  createIsolatedWorktree,
} from './workspace-isolation.js';

export interface RunIsolatedVerificationInput {
  repoRoot: string;
  candidateFilePath: string;
  candidateContent: string;
  baseRef?: string;
  runId?: string;
  tempRoot?: string;
}

export interface IsolatedVerificationEvidence {
  passed: boolean;
  durationMs: number;
  summary: string;
}

export interface IsolatedVerificationResult {
  passed: boolean;
  diagnostics: VerificationRunResult;
  evidence: IsolatedVerificationEvidence;
  cleanupWarnings: string[];
}

function resolveCandidatePath(worktreePath: string, candidateFilePath: string): string {
  const normalized = candidateFilePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const resolved = path.resolve(worktreePath, normalized);
  const rootWithSep = worktreePath.endsWith(path.sep) ? worktreePath : `${worktreePath}${path.sep}`;
  if (resolved !== worktreePath && !resolved.startsWith(rootWithSep)) {
    throw new Error(
      `Candidate file path resolves outside isolated workspace: ${candidateFilePath}`,
    );
  }
  return resolved;
}

function toFailureCategory(error: unknown): VerificationFailureCategory {
  if (error instanceof WorktreeIsolationError) {
    if (error.details.category === 'setup') {
      return 'setup';
    }
    return 'infra';
  }

  return 'unknown';
}

function toFailureReason(error: unknown): string {
  if (error instanceof WorktreeIsolationError) {
    const op = error.details.operation;
    const stderr = error.details.stderrTail?.trim();
    if (stderr) {
      return `${error.message} (${op}): ${stderr}`;
    }
    return `${error.message} (${op})`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function appendSyntheticFailureStage(opts: {
  stages: VerificationStageResult[];
  stageName: string;
  category: VerificationFailureCategory;
  reason: string;
}): void {
  const now = new Date().toISOString();
  opts.stages.push({
    name: opts.stageName,
    status: 'error',
    startedAt: now,
    endedAt: now,
    durationMs: 0,
    failureCategory: opts.category,
    failureReason: opts.reason,
  });
}

function summarizeEvidence(result: VerificationRunResult): string {
  if (result.overallStatus === 'pass') {
    return `Isolated verification passed in ${result.durationMs}ms with ${result.stages.length} stages.`;
  }

  const failedStage = result.stages.find(
    (stage) => stage.status !== 'pass' && stage.status !== 'skipped',
  );
  const reason = failedStage?.failureReason ?? result.failure?.reason ?? 'verification failed';
  const stageLabel = failedStage?.name ?? result.failure?.stage ?? 'unknown-stage';
  return `Isolated verification ${result.overallStatus}: ${stageLabel} - ${reason}`;
}

function ensureRequiredStages(stages: VerificationStageResult[]): void {
  for (const stageName of REQUIRED_VERIFICATION_STAGES) {
    const stage = stages.find((candidate) => candidate.name === stageName);
    if (!stage) {
      appendSyntheticFailureStage({
        stages,
        stageName,
        category: 'setup',
        reason: `Required stage \"${stageName}\" did not execute (fail-closed).`,
      });
    }
  }
}

export async function runIsolatedVerification(
  input: RunIsolatedVerificationInput,
): Promise<IsolatedVerificationResult> {
  const startedAt = new Date();
  const runId = input.runId?.trim() || `isolated-verifier-${Date.now()}`;
  const baseRef = input.baseRef ?? 'HEAD';

  let worktreePath = '';
  const stages: VerificationStageResult[] = [];
  const cleanupWarnings: string[] = [];

  try {
    const worktree = await createIsolatedWorktree({
      repoRoot: input.repoRoot,
      baseRef,
      runId,
      tempRoot: input.tempRoot,
      timeoutMs: 30_000,
    });
    worktreePath = worktree.worktreePath;

    const candidateAbsolutePath = resolveCandidatePath(
      worktree.worktreePath,
      input.candidateFilePath,
    );
    mkdirSync(path.dirname(candidateAbsolutePath), { recursive: true });
    writeFileSync(candidateAbsolutePath, input.candidateContent, 'utf8');

    const verificationPlan = buildVerificationPlan({
      workspaceRoot: worktree.worktreePath,
      candidateFilePath: input.candidateFilePath,
    });

    for (const stagePlan of verificationPlan.stages) {
      const stageStartedAt = new Date();
      const boundedResult = await runBoundedCommand({
        command: stagePlan.command,
        args: stagePlan.args,
        cwd: stagePlan.cwd,
        timeoutMs: stagePlan.timeoutMs,
        maxOutputBytes: stagePlan.maxOutputBytes,
        nodeMaxOldSpaceSizeMb: stagePlan.nodeMaxOldSpaceSizeMb,
        env: process.env,
      });

      const stageResult = buildVerificationStageResultFromCommand({
        stageName: stagePlan.name,
        startedAt: stageStartedAt,
        boundedResult,
      });
      stages.push(stageResult);

      if (stagePlan.required && stageResult.status !== 'pass') {
        break;
      }
    }
  } catch (error) {
    appendSyntheticFailureStage({
      stages,
      stageName: 'setup',
      category: toFailureCategory(error),
      reason: toFailureReason(error),
    });
  } finally {
    if (worktreePath) {
      try {
        const cleanup = await cleanupIsolatedWorktree({
          repoRoot: input.repoRoot,
          worktreePath,
          timeoutMs: 30_000,
          prune: true,
        });
        cleanupWarnings.push(...cleanup.warnings);
      } catch (error) {
        appendSyntheticFailureStage({
          stages,
          stageName: 'cleanup',
          category: 'infra',
          reason: toFailureReason(error),
        });
      }
    }
  }

  ensureRequiredStages(stages);

  const diagnostics = buildVerificationRunResult({
    runId,
    startedAt,
    endedAt: new Date(),
    workspace: {
      path: worktreePath,
      isolated: true,
      baseRef,
    },
    stages,
  });

  const evidence: IsolatedVerificationEvidence = {
    passed: diagnostics.overallStatus === 'pass',
    durationMs: diagnostics.durationMs,
    summary: summarizeEvidence(diagnostics),
  };

  return {
    passed: evidence.passed,
    diagnostics,
    evidence,
    cleanupWarnings,
  };
}
