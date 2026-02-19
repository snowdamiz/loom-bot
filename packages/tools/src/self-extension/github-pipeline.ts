import { createHash } from 'node:crypto';
import type { DbClient } from '@jarvis/db';
import { buildSelfExtensionBranchName } from './branch-naming.js';
import { buildCommitMetadata, type SelfExtensionExecutionContext } from './pipeline-context.js';
import { resolveTrustedGitHubContext } from './github-trust-guard.js';

const GITHUB_API_BASE_URL = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';
const SANDBOX_STATUS_CONTEXT = 'jarvis/sandbox';

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
  executionContext?: SelfExtensionExecutionContext;
  sandboxEvidence: SandboxEvidence;
}

export interface GitHubSelfExtensionPipelineResult {
  success: boolean;
  error?: string;
  branchName?: string;
  headSha?: string;
  pullRequestUrl?: string;
  pullRequestNumber?: number;
  evidenceStatusContext: string;
  evidenceState: 'success' | 'failure';
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
  const payload = rawBody.length > 0 ? JSON.parse(rawBody) as unknown : null;

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

export async function runGitHubSelfExtensionPipeline(
  input: GitHubSelfExtensionPipelineInput,
): Promise<GitHubSelfExtensionPipelineResult> {
  let branchName: string | undefined;
  let headSha: string | undefined;

  try {
    const trusted = await resolveTrustedGitHubContext(input.db);
    const { owner, repo } = parseRepoFullName(trusted.repoFullName);
    const executionContext = normalizeExecutionContext(input);

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

    return {
      success: true,
      branchName,
      headSha,
      evidenceStatusContext: SANDBOX_STATUS_CONTEXT,
      evidenceState: toEvidenceState(input.sandboxEvidence.passed),
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      branchName,
      headSha,
      evidenceStatusContext: SANDBOX_STATUS_CONTEXT,
      evidenceState: toEvidenceState(input.sandboxEvidence.passed),
    };
  }
}
