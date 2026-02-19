import type { DbClient } from '@jarvis/db';
import { compileTypeScript } from './compiler.js';
import { runGitHubSelfExtensionPipeline } from './github-pipeline.js';
import { runIsolatedVerification } from './isolated-verifier.js';
import type { VerificationRunResult } from './verification-diagnostics.js';
import type { SelfExtensionExecutionContext } from './pipeline-context.js';

const SANDBOX_STATUS_CONTEXT = 'jarvis/sandbox';

export interface StageBuiltinChangeResult {
  success: boolean;
  error?: string;
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
  verificationSummary?: string;
  verificationDiagnostics?: VerificationRunResult;
}

function summarizeVerificationFailure(diagnostics: VerificationRunResult): string {
  const failedStage = diagnostics.stages.find(
    (stage) => stage.status !== 'pass' && stage.status !== 'skipped',
  );
  const reason = failedStage?.failureReason ?? diagnostics.failure?.reason ?? 'unknown verification failure';
  const stage = failedStage?.name ?? diagnostics.failure?.stage ?? 'unknown-stage';
  return `${stage}: ${reason}`;
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
  try {
    await compileTypeScript(opts.newContent);
  } catch (err) {
    return {
      success: false,
      error: `Compilation failed: ${err instanceof Error ? err.message : String(err)}`,
      evidenceStatusContext: SANDBOX_STATUS_CONTEXT,
      evidenceState: 'failure',
      promotionAttempted: false,
      promotionSucceeded: false,
      promotionBlocked: false,
      blockReasons: [],
    };
  }

  const verification = await runIsolatedVerification({
    repoRoot: process.cwd(),
    candidateFilePath: opts.filePath,
    candidateContent: opts.newContent,
    baseRef: 'HEAD',
    runId: `builtin-${opts.toolName}-${Date.now()}`,
  });

  if (!verification.passed) {
    return {
      success: false,
      error: `Isolated verification failed: ${summarizeVerificationFailure(verification.diagnostics)}`,
      evidenceStatusContext: SANDBOX_STATUS_CONTEXT,
      evidenceState: 'failure',
      promotionAttempted: false,
      promotionSucceeded: false,
      promotionBlocked: true,
      blockReasons: ['isolated-verification-failed'],
      verificationSummary: verification.evidence.summary,
      verificationDiagnostics: verification.diagnostics,
    };
  }

  const pipelineResult = await runGitHubSelfExtensionPipeline({
    db: opts.db,
    toolName: opts.toolName,
    filePath: opts.filePath,
    newContent: opts.newContent,
    executionContext: opts.executionContext,
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
      verificationSummary: verification.evidence.summary,
      verificationDiagnostics: verification.diagnostics,
    };
  }

  return {
    success: true,
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
    verificationSummary: verification.evidence.summary,
    verificationDiagnostics: verification.diagnostics,
  };
}
