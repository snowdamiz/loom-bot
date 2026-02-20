import { createHash } from 'node:crypto';
import { agentState, eq } from '@jarvis/db';
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
const PROMOTION_PENDING_HEALTH_REASON = 'promotion-pending-health';
const ROLLBACK_REQUIRED_REASON = 'rollback-required';
const BLOCKED_PIPELINE_STATUSES = new Set([
  'promoted_pending_health',
  'health_failed',
  'rollback_in_progress',
  'rollback_failed',
]);

export const SELF_EXTENSION_PIPELINE_STATUS_KEY = 'self_extension:pipeline_status';
export const SELF_EXTENSION_KNOWN_GOOD_BASELINE_KEY = 'self_extension:known_good_baseline';
export const DEFAULT_POST_PROMOTION_HEALTH_WINDOW_MS = 5 * 60 * 1000;

interface GitHubRefResponse {
  object?: {
    sha?: string;
  };
}

interface GitHubContentResponse {
  sha?: string;
  content?: string;
  encoding?: string;
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

export interface GitHubRollbackPipelineInput {
  db: DbClient;
  filePath: string;
  targetBaselineSha: string;
  reason: string;
  sourceRunId?: string | null;
}

export interface GitHubRollbackPipelineResult {
  success: boolean;
  error?: string;
  branchName?: string;
  headSha?: string;
  pullRequestUrl?: string;
  pullRequestNumber?: number;
  targetBaselineSha: string;
}

interface PipelineStatusSnapshot {
  status?: string;
  previousBaselineSha?: string | null;
  [key: string]: unknown;
}

interface KnownGoodBaselineSnapshot {
  sha?: string;
  [key: string]: unknown;
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

function parseObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function parsePipelineStatus(value: unknown): PipelineStatusSnapshot | null {
  const row = parseObject(value);
  if (!row) {
    return null;
  }
  return row as unknown as PipelineStatusSnapshot;
}

function parseKnownGoodBaseline(value: unknown): KnownGoodBaselineSnapshot | null {
  const row = parseObject(value);
  if (!row) {
    return null;
  }
  return row as unknown as KnownGoodBaselineSnapshot;
}

async function readAgentStateValue(db: DbClient, key: string): Promise<unknown> {
  const rows = await db
    .select()
    .from(agentState)
    .where(eq(agentState.key, key))
    .limit(1);
  return rows[0]?.value;
}

async function upsertAgentStateValue(db: DbClient, key: string, value: unknown): Promise<void> {
  const existingRows = await db
    .select()
    .from(agentState)
    .where(eq(agentState.key, key))
    .limit(1);

  if (existingRows.length > 0) {
    await db
      .update(agentState)
      .set({ value, updatedAt: new Date() })
      .where(eq(agentState.key, key));
    return;
  }

  await db.insert(agentState).values({ key, value });
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

function decodeGitHubContent(content: string): string {
  const normalized = content.replace(/\n/g, '');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

async function fetchFileContentAtRef(input: {
  accessToken: string;
  owner: string;
  repo: string;
  ref: string;
  filePath: string;
}): Promise<string> {
  const encodedPath = encodeFilePath(input.filePath);
  const payload = await githubApiRequest<GitHubContentResponse>(
    input.accessToken,
    `/repos/${input.owner}/${input.repo}/contents/${encodedPath}?ref=${encodeURIComponent(input.ref)}`,
  );

  const content = payload.content;
  const encoding = payload.encoding?.toLowerCase();

  if (typeof content !== 'string') {
    throw new Error(
      `Rollback blocked: no file content returned for ${input.filePath} at ${input.ref}.`,
    );
  }

  if (encoding && encoding !== 'base64') {
    throw new Error(
      `Rollback blocked: unsupported GitHub content encoding "${encoding}" for ${input.filePath}.`,
    );
  }

  return decodeGitHubContent(content);
}

function buildRollbackBranchName(input: {
  filePath: string;
  targetBaselineSha: string;
  sourceRunId: string;
}): string {
  const pathHash = createHash('sha256')
    .update(`${input.filePath}:${input.sourceRunId}`)
    .digest('hex')
    .slice(0, 10);

  return `jarvis/rollback-${input.targetBaselineSha.slice(0, 12)}-${pathHash}`;
}

function buildRollbackPullRequestTitle(filePath: string, targetBaselineSha: string): string {
  return `jarvis: rollback builtin ${filePath} to ${targetBaselineSha.slice(0, 12)}`;
}

function buildRollbackPullRequestBody(input: {
  filePath: string;
  targetBaselineSha: string;
  sourceRunId: string;
  reason: string;
  branchName: string;
  headSha: string;
  defaultBranch: string;
}): string {
  return [
    '# Jarvis Self-Extension Rollback',
    '',
    `Restoring \`${input.filePath}\` from known-good baseline \`${input.targetBaselineSha}\`.`,
    '',
    `- sourceRunId: \`${input.sourceRunId}\``,
    `- reason: ${input.reason}`,
    `- rollbackBranch: \`${input.branchName}\``,
    `- rollbackHead: \`${input.headSha}\``,
    `- base: \`${input.defaultBranch}\``,
  ].join('\n');
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

export async function runGitHubRollbackPipeline(
  input: GitHubRollbackPipelineInput,
): Promise<GitHubRollbackPipelineResult> {
  let branchName: string | undefined;
  let headSha: string | undefined;
  let pullRequestUrl: string | undefined;
  let pullRequestNumber: number | undefined;

  try {
    const trusted = await resolveTrustedGitHubContext(input.db);
    const { owner, repo } = parseRepoFullName(trusted.repoFullName);
    const sourceRunId = input.sourceRunId?.trim()
      ? input.sourceRunId.trim()
      : `rollback-${Date.now()}`;

    const rollbackContent = await fetchFileContentAtRef({
      accessToken: trusted.accessToken,
      owner,
      repo,
      ref: input.targetBaselineSha,
      filePath: input.filePath,
    });

    branchName = buildRollbackBranchName({
      filePath: input.filePath,
      targetBaselineSha: input.targetBaselineSha,
      sourceRunId,
    });

    await ensureDeterministicBranch({
      accessToken: trusted.accessToken,
      owner,
      repo,
      defaultBranch: trusted.defaultBranch,
      branchName,
    });

    headSha = await commitFileUpdate({
      accessToken: trusted.accessToken,
      owner,
      repo,
      branchName,
      filePath: input.filePath,
      newContent: rollbackContent,
      commitMessage: [
        `agent: rollback builtin ${input.filePath}`,
        '',
        `Rollback-Source-Run: ${sourceRunId}`,
        `Rollback-Target-Baseline: ${input.targetBaselineSha}`,
        `Rollback-Reason: ${input.reason}`,
      ].join('\n'),
    });

    const pullRequest = await upsertPullRequest({
      accessToken: trusted.accessToken,
      owner,
      repo,
      branchName,
      defaultBranch: trusted.defaultBranch,
      title: buildRollbackPullRequestTitle(input.filePath, input.targetBaselineSha),
      body: buildRollbackPullRequestBody({
        filePath: input.filePath,
        targetBaselineSha: input.targetBaselineSha,
        sourceRunId,
        reason: input.reason,
        branchName,
        headSha,
        defaultBranch: trusted.defaultBranch,
      }),
    });
    pullRequestUrl = pullRequest.htmlUrl;
    pullRequestNumber = pullRequest.number;

    if (!pullRequestNumber) {
      return {
        success: false,
        error: 'Rollback blocked: pull request number is missing for merge attempt.',
        branchName,
        headSha,
        pullRequestUrl,
        pullRequestNumber,
        targetBaselineSha: input.targetBaselineSha,
      };
    }

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

    return {
      success: true,
      branchName,
      headSha,
      pullRequestUrl,
      pullRequestNumber,
      targetBaselineSha: input.targetBaselineSha,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      branchName,
      headSha,
      pullRequestUrl,
      pullRequestNumber,
      targetBaselineSha: input.targetBaselineSha,
    };
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

    const currentPipelineStatus = parsePipelineStatus(
      await readAgentStateValue(input.db, SELF_EXTENSION_PIPELINE_STATUS_KEY),
    );
    const pipelineStatusValue = typeof currentPipelineStatus?.status === 'string'
      ? currentPipelineStatus.status
      : null;
    if (pipelineStatusValue && BLOCKED_PIPELINE_STATUSES.has(pipelineStatusValue)) {
      const pipelineBlockReason = pipelineStatusValue === 'promoted_pending_health'
        ? PROMOTION_PENDING_HEALTH_REASON
        : ROLLBACK_REQUIRED_REASON;

      await appendSelfExtensionEvent(input.db, {
        runId,
        stage: 'promotion-guard',
        eventType: 'promotion_blocked',
        executionContext,
        payload: {
          reason: pipelineBlockReason,
          pipelineStatus: pipelineStatusValue,
          check: 'pipeline-status',
        },
      });

      return {
        success: false,
        error: `Promotion blocked: pipeline status \"${pipelineStatusValue}\" requires health or rollback resolution.`,
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
        blockReasons: [pipelineBlockReason],
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

    const baselineSnapshot = parseKnownGoodBaseline(
      await readAgentStateValue(input.db, SELF_EXTENSION_KNOWN_GOOD_BASELINE_KEY),
    );
    const previousBaselineSha = typeof baselineSnapshot?.sha === 'string'
      ? baselineSnapshot.sha
      : null;
    const promotedAt = new Date().toISOString();
    const healthDeadlineAt = new Date(
      Date.now() + DEFAULT_POST_PROMOTION_HEALTH_WINDOW_MS,
    ).toISOString();

    await upsertAgentStateValue(input.db, SELF_EXTENSION_PIPELINE_STATUS_KEY, {
      status: 'promoted_pending_health',
      runId,
      toolName: input.toolName,
      filePath: input.filePath,
      branchName,
      headSha,
      pullRequestNumber,
      pullRequestUrl,
      promotedAt,
      healthDeadlineAt,
      previousBaselineSha,
      rollback: null,
    });

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
