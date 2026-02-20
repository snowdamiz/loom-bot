import type { DbClient } from '@jarvis/db';
import { compileTypeScript } from './compiler.js';
import { runGitHubSelfExtensionPipeline } from './github-pipeline.js';
import { runIsolatedVerification } from './isolated-verifier.js';
import type { VerificationRunResult } from './verification-diagnostics.js';
import type { SelfExtensionExecutionContext } from './pipeline-context.js';
import { appendSelfExtensionEvent } from './lifecycle-events.js';

const SANDBOX_STATUS_CONTEXT = 'jarvis/sandbox';

export interface StageBuiltinChangeResult {
  success: boolean;
  error?: string;
  lifecycleRunId?: string;
  branchName?: string;
  headSha?: string;
  pullRequestUrl?: string;
  pullRequestNumber?: number;
  evidenceStatusContext: string;
  evidenceState: 'success' | 'failure';
  promotionAttempted: boolean;
  promotionSucceeded: boolean;
  promotionBlocked: boolean;
  blockReasons: string[];
  mergeError?: string;
  rollbackAttempted?: boolean;
  rollbackStatus?: string | null;
  rollbackReason?: string | null;
  rollbackTargetBaselineSha?: string | null;
  rollbackRunId?: string | null;
  verificationSummary?: string;
  verificationDiagnostics?: VerificationRunResult;
  verificationOverallStatus?: VerificationRunResult['overallStatus'];
  verificationFailedStage?: string | null;
  verificationFailureCategory?: string | null;
  verificationFailureReason?: string | null;
}

function summarizeVerificationFailure(diagnostics: VerificationRunResult): string {
  const failedStage = diagnostics.stages.find(
    (stage) => stage.status !== 'pass' && stage.status !== 'skipped',
  );
  const reason = failedStage?.failureReason ?? diagnostics.failure?.reason ?? 'unknown verification failure';
  const stage = failedStage?.name ?? diagnostics.failure?.stage ?? 'unknown-stage';
  return `${stage}: ${reason}`;
}

function extractVerificationOutcome(
  diagnostics: VerificationRunResult,
): {
  verificationOverallStatus: VerificationRunResult['overallStatus'];
  verificationFailedStage: string | null;
  verificationFailureCategory: string | null;
  verificationFailureReason: string | null;
} {
  const failedStage = diagnostics.stages.find(
    (stage) => stage.status !== 'pass' && stage.status !== 'skipped',
  );

  return {
    verificationOverallStatus: diagnostics.overallStatus,
    verificationFailedStage: failedStage?.name ?? diagnostics.failure?.stage ?? null,
    verificationFailureCategory:
      failedStage?.failureCategory ?? diagnostics.failure?.category ?? null,
    verificationFailureReason:
      failedStage?.failureReason ?? diagnostics.failure?.reason ?? null,
  };
}

/**
 * stageBuiltinChange — validates a built-in modification and then delegates
 * repository writes to the GitHub self-extension pipeline.
 *
 * Safety ordering is preserved:
 * 1) compile candidate code
 * 2) run isolated verification policy (compile + targetedTests + startupSmoke)
 * 3) execute repository branch/commit/PR pipeline
 */
export async function stageBuiltinChange(opts: {
  db: DbClient;
  toolName: string;
  filePath: string;
  newContent: string;
  testInput: unknown;
  executionContext?: SelfExtensionExecutionContext;
}): Promise<StageBuiltinChangeResult> {
  const runId = `builtin-${opts.toolName}-${Date.now()}`;
  const executionContext: SelfExtensionExecutionContext = {
    goalId: opts.executionContext?.goalId ?? null,
    cycleId: opts.executionContext?.cycleId ?? null,
    subGoalId: opts.executionContext?.subGoalId ?? null,
    toolName: opts.executionContext?.toolName ?? opts.toolName,
    toolCallId: opts.executionContext?.toolCallId ?? null,
    actorSource: opts.executionContext?.actorSource ?? 'tool-write',
  };

  await appendSelfExtensionEvent(opts.db, {
    runId,
    stage: 'staging',
    eventType: 'proposed',
    executionContext,
    payload: {
      filePath: opts.filePath,
      toolName: opts.toolName,
    },
  });

  try {
    await compileTypeScript(opts.newContent);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await appendSelfExtensionEvent(opts.db, {
      runId,
      stage: 'compile',
      eventType: 'failed',
      executionContext,
      payload: {
        filePath: opts.filePath,
        toolName: opts.toolName,
        reason: message,
      },
    });

    return {
      success: false,
      error: `Compilation failed: ${message}`,
      lifecycleRunId: runId,
      evidenceStatusContext: SANDBOX_STATUS_CONTEXT,
      evidenceState: 'failure',
      promotionAttempted: false,
      promotionSucceeded: false,
      promotionBlocked: false,
      blockReasons: [],
      rollbackAttempted: false,
      rollbackStatus: null,
      rollbackReason: null,
      rollbackTargetBaselineSha: null,
      rollbackRunId: null,
    };
  }

  const verification = await runIsolatedVerification({
    repoRoot: process.cwd(),
    candidateFilePath: opts.filePath,
    candidateContent: opts.newContent,
    baseRef: 'HEAD',
    runId,
  });

  const verificationOutcome = extractVerificationOutcome(verification.diagnostics);
  await appendSelfExtensionEvent(opts.db, {
    runId,
    stage: 'verification',
    eventType: 'tested',
    executionContext,
    payload: {
      passed: verification.passed,
      overallStatus: verificationOutcome.verificationOverallStatus,
      failedStage: verificationOutcome.verificationFailedStage,
      failureCategory: verificationOutcome.verificationFailureCategory,
      summary: verification.evidence.summary,
      durationMs: verification.evidence.durationMs,
    },
  });

  if (!verification.passed) {
    await appendSelfExtensionEvent(opts.db, {
      runId,
      stage: 'verification',
      eventType: 'failed',
      executionContext,
      payload: {
        filePath: opts.filePath,
        toolName: opts.toolName,
        reason: 'isolated-verification-failed',
        overallStatus: verificationOutcome.verificationOverallStatus,
        failedStage: verificationOutcome.verificationFailedStage,
        failureCategory: verificationOutcome.verificationFailureCategory,
        failureReason: verificationOutcome.verificationFailureReason,
      },
    });

    return {
      success: false,
      error: `Isolated verification failed: ${summarizeVerificationFailure(verification.diagnostics)}`,
      lifecycleRunId: runId,
      evidenceStatusContext: SANDBOX_STATUS_CONTEXT,
      evidenceState: 'failure',
      promotionAttempted: false,
      promotionSucceeded: false,
      promotionBlocked: true,
      blockReasons: ['isolated-verification-failed'],
      rollbackAttempted: false,
      rollbackStatus: null,
      rollbackReason: null,
      rollbackTargetBaselineSha: null,
      rollbackRunId: null,
      verificationSummary: verification.evidence.summary,
      verificationDiagnostics: verification.diagnostics,
      verificationOverallStatus: verificationOutcome.verificationOverallStatus,
      verificationFailedStage: verificationOutcome.verificationFailedStage,
      verificationFailureCategory: verificationOutcome.verificationFailureCategory,
      verificationFailureReason: verificationOutcome.verificationFailureReason,
    };
  }

  const pipelineResult = await runGitHubSelfExtensionPipeline({
    db: opts.db,
    toolName: opts.toolName,
    filePath: opts.filePath,
    newContent: opts.newContent,
    executionContext,
    runId,
    sandboxEvidence: {
      passed: verification.evidence.passed,
      durationMs: verification.evidence.durationMs,
      summary: verification.evidence.summary,
    },
  });

  if (!pipelineResult.success) {
    return {
      success: false,
      error: pipelineResult.error,
      lifecycleRunId: runId,
      branchName: pipelineResult.branchName,
      headSha: pipelineResult.headSha,
      pullRequestUrl: pipelineResult.pullRequestUrl,
      pullRequestNumber: pipelineResult.pullRequestNumber,
      evidenceStatusContext: pipelineResult.evidenceStatusContext,
      evidenceState: pipelineResult.evidenceState,
      promotionAttempted: pipelineResult.promotionAttempted,
      promotionSucceeded: pipelineResult.promotionSucceeded,
      promotionBlocked: pipelineResult.promotionBlocked,
      blockReasons: pipelineResult.blockReasons,
      mergeError: pipelineResult.mergeError,
      rollbackAttempted: pipelineResult.rollbackAttempted,
      rollbackStatus: pipelineResult.rollbackStatus,
      rollbackReason: pipelineResult.rollbackReason,
      rollbackTargetBaselineSha: pipelineResult.rollbackTargetBaselineSha,
      rollbackRunId: pipelineResult.rollbackRunId,
      verificationSummary: verification.evidence.summary,
      verificationDiagnostics: verification.diagnostics,
      verificationOverallStatus: verificationOutcome.verificationOverallStatus,
      verificationFailedStage: verificationOutcome.verificationFailedStage,
      verificationFailureCategory: verificationOutcome.verificationFailureCategory,
      verificationFailureReason: verificationOutcome.verificationFailureReason,
    };
  }

  return {
    success: true,
    lifecycleRunId: runId,
    branchName: pipelineResult.branchName,
    headSha: pipelineResult.headSha,
    pullRequestUrl: pipelineResult.pullRequestUrl,
    pullRequestNumber: pipelineResult.pullRequestNumber,
    evidenceStatusContext: pipelineResult.evidenceStatusContext,
    evidenceState: pipelineResult.evidenceState,
    promotionAttempted: pipelineResult.promotionAttempted,
    promotionSucceeded: pipelineResult.promotionSucceeded,
    promotionBlocked: pipelineResult.promotionBlocked,
    blockReasons: pipelineResult.blockReasons,
    mergeError: pipelineResult.mergeError,
    rollbackAttempted: pipelineResult.rollbackAttempted,
    rollbackStatus: pipelineResult.rollbackStatus,
    rollbackReason: pipelineResult.rollbackReason,
    rollbackTargetBaselineSha: pipelineResult.rollbackTargetBaselineSha,
    rollbackRunId: pipelineResult.rollbackRunId,
    verificationSummary: verification.evidence.summary,
    verificationDiagnostics: verification.diagnostics,
    verificationOverallStatus: verificationOutcome.verificationOverallStatus,
    verificationFailedStage: verificationOutcome.verificationFailedStage,
    verificationFailureCategory: verificationOutcome.verificationFailureCategory,
    verificationFailureReason: verificationOutcome.verificationFailureReason,
  };
}
