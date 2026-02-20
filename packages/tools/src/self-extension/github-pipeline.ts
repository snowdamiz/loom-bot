import { createHash } from 'node:crypto';
import type { DbClient } from '@jarvis/db';
import { buildSelfExtensionBranchName } from './branch-naming.js';
import { buildCommitMetadata, type SelfExtensionExecutionContext } from './pipeline-context.js';
import { evaluatePromotionGate, type PromotionStatusContext } from './promotion-gate.js';
import { resolveTrustedGitHubContext } from './github-trust-guard.js';
import { appendSelfExtensionEvent } from './lifecycle-events.js';
import { getPromotionControlState } from './promotion-control.js';

const GITHUB_API_BASE_URL = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';
const SANDBOX_STATUS_CONTEXT = 'jarvis/sandbox';
const PROMOTION_PAUSED_REASON = 'promotion-paused';

interface GitHubRefResponse {
  object?: {
    sha?: string;
  };
}

interface GitHubContentResponse {
  sha?: string;
}

interface GitHubPutContentResponse {
  commit?: {
    sha?: string;
  };
}

interface GitHubPullRequest {
  number: number;
  html_url: string;
}

interface GitHubCommitStatus {
  context?: string;
  state?: string;
}

interface GitHubCombinedStatusResponse {
  statuses?: GitHubCommitStatus[];
}

interface GitHubMergeResponse {
  merged?: boolean;
  message?: string;
  sha?: string;
}

export interface SandboxEvidence {
  passed: boolean;
  durationMs: number;
  summary: string;
}

export interface GitHubSelfExtensionPipelineInput {
  db: DbClient;
  toolName: string;
  filePath: string;
  newContent: string;
  runId?: string;
  executionContext?: SelfExtensionExecutionContext;
  sandboxEvidence: SandboxEvidence;
}

export interface GitHubSelfExtensionPipelineResult {
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
}

class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

function githubHeaders(accessToken: string): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  };
}

async function githubApiRequest<T>(
  accessToken: string,
  pathname: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${GITHUB_API_BASE_URL}${pathname}`, {
    ...init,
    headers: {
      ...githubHeaders(accessToken),
      ...(init?.headers ?? {}),
    },
  });

  const rawBody = await response.text();
  let payload: unknown = null;
  if (rawBody.length > 0) {
    try {
      payload = JSON.parse(rawBody) as unknown;
    } catch {
      payload = rawBody;
    }
  }

  if (!response.ok) {
    const detail = typeof payload === 'object' && payload !== null && 'message' in payload
      ? String((payload as { message?: unknown }).message ?? '')
      : '';
    throw new GitHubApiError(
      response.status,
      `GitHub API request failed (${response.status}) for ${pathname}${detail ? `: ${detail}` : ''}`,
    );
  }

  return payload as T;
}

function parseRepoFullName(fullName: string): { owner: string; repo: string } {
  const [owner, repo] = fullName.split('/');
  if (!owner || !repo) {
    throw new Error(`Trusted repository "${fullName}" is not in owner/repo format.`);
  }
  return { owner, repo };
}

function encodeFilePath(filePath: string): string {
  return filePath
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function normalizeExecutionContext(
  input: GitHubSelfExtensionPipelineInput,
): SelfExtensionExecutionContext {
  return {
    goalId: input.executionContext?.goalId ?? null,
    cycleId: input.executionContext?.cycleId ?? null,
    subGoalId: input.executionContext?.subGoalId ?? null,
    toolName: input.executionContext?.toolName ?? input.toolName,
    toolCallId: input.executionContext?.toolCallId ?? null,
    actorSource: input.executionContext?.actorSource ?? 'tool-write',
  };
}

function toEvidenceState(passed: boolean): 'success' | 'failure' {
  return passed ? 'success' : 'failure';
}

function redactEvidenceSummary(summary: string): string {
  return summary
    .replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g, '[redacted-github-token]')
    .replace(/(Bearer\s+)[^\s]+/gi, '$1[redacted-token]')
    .replace(/sk-[A-Za-z0-9]{16,}/g, '[redacted-secret]')
    .slice(0, 500);
}

function buildEvidenceSection(input: {
  toolName: string;
  filePath: string;
  headSha: string;
  branchName: string;
  evidence: SandboxEvidence;
}): string {
  const outcome = input.evidence.passed ? 'PASS' : 'FAIL';
  const summary = redactEvidenceSummary(input.evidence.summary || 'No summary provided.');

  return [
    '## Sandbox Evidence',
    `- context: ${SANDBOX_STATUS_CONTEXT}`,
    `- result: ${outcome}`,
    `- durationMs: ${input.evidence.durationMs}`,
    `- tool: ${input.toolName}`,
    `- file: ${input.filePath}`,
    `- branch: ${input.branchName}`,
    `- headSha: ${input.headSha}`,
    '',
    '### Diagnostic Summary',
    summary,
  ].join('\n');
}

function buildPullRequestTitle(toolName: string, filePath: string): string {
  return `jarvis: builtin modify ${toolName} (${filePath})`;
}

function buildPullRequestBody(input: {
  branchName: string;
  defaultBranch: string;
  headSha: string;
  evidence: SandboxEvidence;
  toolName: string;
  filePath: string;
  metadataJson: string;
}): string {
  return [
    '# Jarvis Self-Extension Candidate',
    '',
    `This PR tracks deterministic self-modification for \`${input.filePath}\`.`,
    '',
    '- flow: deterministic branch/commit/PR upsert',
    `- branch: \`${input.branchName}\``,
    `- base: \`${input.defaultBranch}\``,
    `- head: \`${input.headSha}\``,
    `- tool: \`${input.toolName}\``,
    '',
    '## Commit Metadata',
    '```json',
    input.metadataJson,
    '```',
    '',
    buildEvidenceSection({
      toolName: input.toolName,
      filePath: input.filePath,
      headSha: input.headSha,
      branchName: input.branchName,
      evidence: input.evidence,
    }),
  ].join('\n');
}

async function fetchRefSha(
  accessToken: string,
  owner: string,
  repo: string,
  refName: string,
): Promise<string | null> {
  try {
    const payload = await githubApiRequest<GitHubRefResponse>(
      accessToken,
      `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(refName)}`,
    );
    const sha = payload.object?.sha?.trim();
    return sha && sha.length > 0 ? sha : null;
  } catch (err) {
    if (err instanceof GitHubApiError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

async function ensureDeterministicBranch(input: {
  accessToken: string;
  owner: string;
  repo: string;
  defaultBranch: string;
  branchName: string;
}): Promise<string> {
  const existingSha = await fetchRefSha(
    input.accessToken,
    input.owner,
    input.repo,
    input.branchName,
  );
  if (existingSha) {
    return existingSha;
  }

  const baseSha = await fetchRefSha(
    input.accessToken,
    input.owner,
    input.repo,
    input.defaultBranch,
  );
  if (!baseSha) {
    throw new Error(`Unable to resolve default branch ref for "${input.defaultBranch}".`);
  }

  await githubApiRequest<unknown>(
    input.accessToken,
    `/repos/${input.owner}/${input.repo}/git/refs`,
    {
      method: 'POST',
      body: JSON.stringify({
        ref: `refs/heads/${input.branchName}`,
        sha: baseSha,
      }),
    },
  );

  return baseSha;
}

async function fetchExistingFileSha(input: {
  accessToken: string;
  owner: string;
  repo: string;
  branchName: string;
  filePath: string;
}): Promise<string | null> {
  const encodedPath = encodeFilePath(input.filePath);
  try {
    const payload = await githubApiRequest<GitHubContentResponse>(
      input.accessToken,
      `/repos/${input.owner}/${input.repo}/contents/${encodedPath}?ref=${encodeURIComponent(input.branchName)}`,
    );
    const sha = payload.sha?.trim();
    return sha && sha.length > 0 ? sha : null;
  } catch (err) {
    if (err instanceof GitHubApiError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

async function commitFileUpdate(input: {
  accessToken: string;
  owner: string;
  repo: string;
  branchName: string;
  filePath: string;
  newContent: string;
  commitMessage: string;
}): Promise<string> {
  const existingSha = await fetchExistingFileSha(input);
  const encodedPath = encodeFilePath(input.filePath);
  const payload = await githubApiRequest<GitHubPutContentResponse>(
    input.accessToken,
    `/repos/${input.owner}/${input.repo}/contents/${encodedPath}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        message: input.commitMessage,
        content: Buffer.from(input.newContent, 'utf8').toString('base64'),
        branch: input.branchName,
        sha: existingSha ?? undefined,
      }),
    },
  );

  const headSha = payload.commit?.sha?.trim();
  if (!headSha) {
    throw new Error('GitHub commit creation blocked: response did not include commit SHA.');
  }

  return headSha;
}

async function upsertPullRequest(input: {
  accessToken: string;
  owner: string;
  repo: string;
  branchName: string;
  defaultBranch: string;
  title: string;
  body: string;
}): Promise<{ number: number; htmlUrl: string }> {
  const params = new URLSearchParams({
    state: 'open',
    head: `${input.owner}:${input.branchName}`,
    base: input.defaultBranch,
  });
  const openPulls = await githubApiRequest<GitHubPullRequest[]>(
    input.accessToken,
    `/repos/${input.owner}/${input.repo}/pulls?${params.toString()}`,
  );

  if (openPulls.length > 0) {
    const existing = openPulls[0];
    // update a pull request when deterministic branch PR already exists.
    const updated = await githubApiRequest<GitHubPullRequest>(
      input.accessToken,
      `/repos/${input.owner}/${input.repo}/pulls/${existing.number}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          title: input.title,
          body: input.body,
          base: input.defaultBranch,
        }),
      },
    );
    return {
      number: updated.number,
      htmlUrl: updated.html_url,
    };
  }

  // create a pull request when branch has no open PR yet.
  const created = await githubApiRequest<GitHubPullRequest>(
    input.accessToken,
    `/repos/${input.owner}/${input.repo}/pulls`,
    {
      method: 'POST',
      body: JSON.stringify({
        title: input.title,
        head: input.branchName,
        base: input.defaultBranch,
        body: input.body,
      }),
    },
  );

  return {
    number: created.number,
    htmlUrl: created.html_url,
  };
}

async function setSandboxStatus(input: {
  accessToken: string;
  owner: string;
  repo: string;
  headSha: string;
  state: 'success' | 'failure';
  pullRequestUrl: string;
}): Promise<void> {
  const description = input.state === 'success'
    ? 'Sandbox verification passed'
    : 'Sandbox verification failed';

  await githubApiRequest<unknown>(
    input.accessToken,
    `/repos/${input.owner}/${input.repo}/statuses/${input.headSha}`,
    {
      method: 'POST',
      body: JSON.stringify({
        state: input.state,
        context: SANDBOX_STATUS_CONTEXT,
        description,
        target_url: input.pullRequestUrl,
      }),
    },
  );
}

async function fetchPromotionStatuses(input: {
  accessToken: string;
  owner: string;
  repo: string;
  headSha: string;
  evidenceState: 'success' | 'failure';
}): Promise<PromotionStatusContext[]> {
  const payload = await githubApiRequest<GitHubCombinedStatusResponse>(
    input.accessToken,
    `/repos/${input.owner}/${input.repo}/commits/${input.headSha}/status`,
  );

  const normalized: PromotionStatusContext[] = [];
  for (const status of payload.statuses ?? []) {
    const context = status.context?.trim();
    const state = status.state?.trim();
    if (!context || !state) {
      continue;
    }
    normalized.push({ context, state });
  }

  const existingSandbox = normalized.some(
    (status) => status.context.toLowerCase() === SANDBOX_STATUS_CONTEXT,
  );
  if (!existingSandbox) {
    // GitHub status reads can lag writes very briefly. Use the write intent to fail closed.
    normalized.push({ context: SANDBOX_STATUS_CONTEXT, state: input.evidenceState });
  }

  return normalized;
}

async function mergePullRequestWithHeadGuard(input: {
  accessToken: string;
  owner: string;
  repo: string;
  pullRequestNumber: number;
  expectedHeadSha: string;
}): Promise<void> {
  const payload = await githubApiRequest<GitHubMergeResponse>(
    input.accessToken,
    `/repos/${input.owner}/${input.repo}/pulls/${input.pullRequestNumber}/merge`,
    {
      method: 'PUT',
      body: JSON.stringify({
        sha: input.expectedHeadSha,
        merge_method: 'squash',
      }),
    },
  );

  if (!payload.merged) {
    throw new Error(`GitHub merge was not completed: ${payload.message ?? 'unknown reason'}`);
  }
}

async function deleteBranchRef(input: {
  accessToken: string;
  owner: string;
  repo: string;
  branchName: string;
}): Promise<void> {
  try {
    await githubApiRequest<unknown>(
      input.accessToken,
      `/repos/${input.owner}/${input.repo}/git/refs/heads/${encodeURIComponent(input.branchName)}`,
      {
        method: 'DELETE',
      },
    );
  } catch (err) {
    if (err instanceof GitHubApiError && (err.status === 404 || err.status === 422)) {
      return;
    }
    throw err;
  }
}

export async function runGitHubSelfExtensionPipeline(
  input: GitHubSelfExtensionPipelineInput,
): Promise<GitHubSelfExtensionPipelineResult> {
  let branchName: string | undefined;
  let headSha: string | undefined;
  let pullRequestUrl: string | undefined;
  let pullRequestNumber: number | undefined;
  const runId = input.runId?.trim()
    ? input.runId.trim()
    : `builtin-${input.toolName}-${Date.now()}`;
  const executionContext = normalizeExecutionContext(input);
  const evidenceState = toEvidenceState(input.sandboxEvidence.passed);

  try {
    const trusted = await resolveTrustedGitHubContext(input.db);
    const { owner, repo } = parseRepoFullName(trusted.repoFullName);

    const promotionControlBeforeGitHub = await getPromotionControlState(input.db);
    if (promotionControlBeforeGitHub.paused) {
      await appendSelfExtensionEvent(input.db, {
        runId,
        stage: 'promotion-guard',
        eventType: 'promotion_blocked',
        executionContext,
        payload: {
          reason: PROMOTION_PAUSED_REASON,
          pausedBy: promotionControlBeforeGitHub.updatedBy,
          pausedAt: promotionControlBeforeGitHub.updatedAt,
          check: 'pre-github',
        },
      });

      return {
        success: false,
        error: 'Promotion blocked: promotion is paused by operator.',
        lifecycleRunId: runId,
        branchName,
        headSha,
        pullRequestUrl,
        pullRequestNumber,
        evidenceStatusContext: SANDBOX_STATUS_CONTEXT,
        evidenceState,
        promotionAttempted: false,
        promotionSucceeded: false,
        promotionBlocked: true,
        blockReasons: [PROMOTION_PAUSED_REASON],
      };
    }

    const contentHash = createHash('sha256')
      .update(input.newContent)
      .digest('hex');
    branchName = buildSelfExtensionBranchName({
      executionContext: {
        goalId: executionContext.goalId ?? 'na',
        cycleId: executionContext.cycleId ?? 'na',
        subGoalId: executionContext.subGoalId ?? 'na',
        toolName: executionContext.toolName,
      },
      filePath: input.filePath,
      contentHash,
    });

    await ensureDeterministicBranch({
      accessToken: trusted.accessToken,
      owner,
      repo,
      defaultBranch: trusted.defaultBranch,
      branchName,
    });

    const commitMetadata = buildCommitMetadata(executionContext);
    const commitMessage = [
      `agent: modify builtin tool ${input.toolName}`,
      '',
      `Jarvis-Meta: ${commitMetadata.serialized}`,
    ].join('\n');

    headSha = await commitFileUpdate({
      accessToken: trusted.accessToken,
      owner,
      repo,
      branchName,
      filePath: input.filePath,
      newContent: input.newContent,
      commitMessage,
    });

    const pullRequestTitle = buildPullRequestTitle(input.toolName, input.filePath);
    const pullRequestBody = buildPullRequestBody({
      branchName,
      defaultBranch: trusted.defaultBranch,
      headSha,
      evidence: input.sandboxEvidence,
      toolName: input.toolName,
      filePath: input.filePath,
      metadataJson: commitMetadata.serialized,
    });

    const pullRequest = await upsertPullRequest({
      accessToken: trusted.accessToken,
      owner,
      repo,
      branchName,
      defaultBranch: trusted.defaultBranch,
      title: pullRequestTitle,
      body: pullRequestBody,
    });
    pullRequestUrl = pullRequest.htmlUrl;
    pullRequestNumber = pullRequest.number;

    await setSandboxStatus({
      accessToken: trusted.accessToken,
      owner,
      repo,
      headSha,
      state: evidenceState,
      pullRequestUrl,
    });

    const promotionStatuses = await fetchPromotionStatuses({
      accessToken: trusted.accessToken,
      owner,
      repo,
      headSha,
      evidenceState,
    });
    const gate = evaluatePromotionGate({
      statuses: promotionStatuses,
    });

    if (gate.blocked) {
      await appendSelfExtensionEvent(input.db, {
        runId,
        stage: 'promotion-gate',
        eventType: 'promotion_blocked',
        executionContext,
        payload: {
          reason: 'status-gate',
          blockReasons: gate.blockReasons,
          branchName,
          headSha,
          pullRequestNumber,
          pullRequestUrl,
        },
      });

      return {
        success: false,
        error: `Promotion blocked: ${gate.blockReasons.join('; ')}`,
        lifecycleRunId: runId,
        branchName,
        headSha,
        pullRequestUrl,
        pullRequestNumber,
        evidenceStatusContext: SANDBOX_STATUS_CONTEXT,
        evidenceState,
        promotionAttempted: true,
        promotionSucceeded: false,
        promotionBlocked: true,
        blockReasons: gate.blockReasons,
      };
    }

    if (!pullRequestNumber) {
      const missingPullRequestReasons = ['Missing pull request number'];
      await appendSelfExtensionEvent(input.db, {
        runId,
        stage: 'promotion-guard',
        eventType: 'promotion_blocked',
        executionContext,
        payload: {
          reason: 'missing-pull-request-number',
          blockReasons: missingPullRequestReasons,
          branchName,
          headSha,
          pullRequestUrl,
        },
      });

      return {
        success: false,
        error: 'Promotion blocked: pull request number is missing for merge attempt.',
        lifecycleRunId: runId,
        branchName,
        headSha,
        pullRequestUrl,
        pullRequestNumber,
        evidenceStatusContext: SANDBOX_STATUS_CONTEXT,
        evidenceState,
        promotionAttempted: true,
        promotionSucceeded: false,
        promotionBlocked: true,
        blockReasons: missingPullRequestReasons,
      };
    }

    const promotionControlBeforeMerge = await getPromotionControlState(input.db);
    if (promotionControlBeforeMerge.paused) {
      await appendSelfExtensionEvent(input.db, {
        runId,
        stage: 'promotion-guard',
        eventType: 'promotion_blocked',
        executionContext,
        payload: {
          reason: PROMOTION_PAUSED_REASON,
          pausedBy: promotionControlBeforeMerge.updatedBy,
          pausedAt: promotionControlBeforeMerge.updatedAt,
          check: 'pre-merge',
          branchName,
          headSha,
          pullRequestNumber,
          pullRequestUrl,
        },
      });

      return {
        success: false,
        error: 'Promotion blocked: promotion was paused before merge.',
        lifecycleRunId: runId,
        branchName,
        headSha,
        pullRequestUrl,
        pullRequestNumber,
        evidenceStatusContext: SANDBOX_STATUS_CONTEXT,
        evidenceState,
        promotionAttempted: true,
        promotionSucceeded: false,
        promotionBlocked: true,
        blockReasons: [PROMOTION_PAUSED_REASON],
      };
    }

    try {
      await mergePullRequestWithHeadGuard({
        accessToken: trusted.accessToken,
        owner,
        repo,
        pullRequestNumber,
        expectedHeadSha: headSha,
      });
      await deleteBranchRef({
        accessToken: trusted.accessToken,
        owner,
        repo,
        branchName,
      });
    } catch (mergeErr) {
      const mergeError = mergeErr instanceof Error ? mergeErr.message : String(mergeErr);
      try {
        await appendSelfExtensionEvent(input.db, {
          runId,
          stage: 'promotion-merge',
          eventType: 'failed',
          executionContext,
          payload: {
            reason: 'merge-failed',
            mergeError,
            branchName,
            headSha,
            pullRequestNumber,
            pullRequestUrl,
          },
        });
      } catch (eventErr) {
        process.stderr.write(
          `[self-extension] Failed to write merge failure event: ${eventErr instanceof Error ? eventErr.message : String(eventErr)}\n`,
        );
      }

      return {
        success: false,
        error: `Promotion merge failed: ${mergeError}`,
        lifecycleRunId: runId,
        mergeError,
        branchName,
        headSha,
        pullRequestUrl,
        pullRequestNumber,
        evidenceStatusContext: SANDBOX_STATUS_CONTEXT,
        evidenceState,
        promotionAttempted: true,
        promotionSucceeded: false,
        promotionBlocked: false,
        blockReasons: [],
      };
    }

    try {
      await appendSelfExtensionEvent(input.db, {
        runId,
        stage: 'promotion-merge',
        eventType: 'promoted',
        executionContext,
        payload: {
          branchName,
          headSha,
          pullRequestNumber,
          pullRequestUrl,
          evidenceState,
        },
      });
    } catch (eventErr) {
      process.stderr.write(
        `[self-extension] Failed to write promoted event: ${eventErr instanceof Error ? eventErr.message : String(eventErr)}\n`,
      );
    }

    return {
      success: true,
      lifecycleRunId: runId,
      branchName,
      headSha,
      pullRequestUrl,
      pullRequestNumber,
      evidenceStatusContext: SANDBOX_STATUS_CONTEXT,
      evidenceState,
      promotionAttempted: true,
      promotionSucceeded: true,
      promotionBlocked: false,
      blockReasons: [],
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    try {
      await appendSelfExtensionEvent(input.db, {
        runId,
        stage: 'promotion-pipeline',
        eventType: 'failed',
        executionContext,
        payload: {
          reason: errorMessage,
          branchName,
          headSha,
          pullRequestNumber,
          pullRequestUrl,
        },
      });
    } catch (eventErr) {
      process.stderr.write(
        `[self-extension] Failed to write pipeline failure event: ${eventErr instanceof Error ? eventErr.message : String(eventErr)}\n`,
      );
    }

    return {
      success: false,
      error: errorMessage,
      lifecycleRunId: runId,
      branchName,
      headSha,
      pullRequestUrl,
      pullRequestNumber,
      evidenceStatusContext: SANDBOX_STATUS_CONTEXT,
      evidenceState,
      promotionAttempted: false,
      promotionSucceeded: false,
      promotionBlocked: false,
      blockReasons: [],
    };
  }
}
