import type { DbClient } from '@jarvis/db';
import { compileTypeScript } from './compiler.js';
import { runInSandbox } from './sandbox-runner.js';
import { runGitHubSelfExtensionPipeline } from './github-pipeline.js';
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
}

function summarizeSandboxOutput(value: unknown): string {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  if (!serialized) {
    return 'No sandbox output was produced.';
  }
  return serialized.slice(0, 400);
}

/**
 * stageBuiltinChange — validates a built-in modification and then delegates
 * repository writes to the GitHub self-extension pipeline.
 *
 * Safety ordering is preserved:
 * 1) compile candidate code
 * 2) run sandbox verification
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
  let compiledCode: string;
  try {
    const compiled = await compileTypeScript(opts.newContent);
    compiledCode = compiled.code;
  } catch (err) {
    return {
      success: false,
      error: `Compilation failed: ${err instanceof Error ? err.message : String(err)}`,
      evidenceStatusContext: SANDBOX_STATUS_CONTEXT,
      evidenceState: 'failure',
    };
  }

  const sandboxStart = Date.now();
  const sandboxResult = await runInSandbox(compiledCode, opts.toolName, opts.testInput, 30_000);
  const sandboxDurationMs = Date.now() - sandboxStart;

  const pipelineResult = await runGitHubSelfExtensionPipeline({
    db: opts.db,
    toolName: opts.toolName,
    filePath: opts.filePath,
    newContent: opts.newContent,
    executionContext: opts.executionContext,
    sandboxEvidence: {
      passed: sandboxResult.passed,
      durationMs: sandboxDurationMs,
      summary: sandboxResult.passed
        ? `Sandbox passed in ${sandboxDurationMs}ms`
        : summarizeSandboxOutput(sandboxResult.error ?? sandboxResult.output),
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
    };
  }

  if (!sandboxResult.passed) {
    return {
      success: false,
      error: `Sandbox test failed: ${sandboxResult.error ?? 'unknown sandbox error'}`,
      branchName: pipelineResult.branchName,
      headSha: pipelineResult.headSha,
      pullRequestUrl: pipelineResult.pullRequestUrl,
      pullRequestNumber: pipelineResult.pullRequestNumber,
      evidenceStatusContext: pipelineResult.evidenceStatusContext,
      evidenceState: pipelineResult.evidenceState,
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
  };
}
