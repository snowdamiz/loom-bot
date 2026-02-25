import { createHash, randomBytes } from 'node:crypto';
import { db, agentState, eq } from '@jarvis/db';

export interface GitHubOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface ExchangeOAuthCodeInput {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}

export interface GitHubAuthenticatedUser {
  id: number;
  login: string;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  default_branch: string;
  owner: {
    login: string;
  };
  permissions?: {
    admin?: boolean;
    push?: boolean;
    pull?: boolean;
  };
}

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_API_BASE_URL = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';
const GITHUB_OAUTH_CONFIG_KEY = 'config:github_oauth';

type GitHubOAuthInputField = 'clientId' | 'clientSecret' | 'redirectUri';

function toBase64Url(input: Buffer): string {
  return input
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function githubApiHeaders(accessToken?: string): HeadersInit {
  const headers: HeadersInit = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

function normalizeConfigValue(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function parseRequiredGitHubOAuthConfig(input: {
  clientId?: unknown;
  clientSecret?: unknown;
  redirectUri?: unknown;
}): {
  config: GitHubOAuthConfig | null;
  missingFields: GitHubOAuthInputField[];
} {
  const clientId = normalizeConfigValue(input.clientId);
  const clientSecret = normalizeConfigValue(input.clientSecret);
  const redirectUri = normalizeConfigValue(input.redirectUri);

  const missingFields: GitHubOAuthInputField[] = [];
  if (!clientId) missingFields.push('clientId');
  if (!clientSecret) missingFields.push('clientSecret');
  if (!redirectUri) missingFields.push('redirectUri');

  if (missingFields.length > 0) {
    return { config: null, missingFields };
  }

  return {
    config: {
      clientId,
      clientSecret,
      redirectUri,
    },
    missingFields: [],
  };
}

export function parseOptionalGitHubOAuthConfig(input: {
  clientId?: unknown;
  clientSecret?: unknown;
  redirectUri?: unknown;
}): {
  provided: boolean;
  config: GitHubOAuthConfig | null;
  missingFields: GitHubOAuthInputField[];
} {
  const hasAnyValue = [input.clientId, input.clientSecret, input.redirectUri]
    .some((value) => normalizeConfigValue(value).length > 0);

  if (!hasAnyValue) {
    return {
      provided: false,
      config: null,
      missingFields: [],
    };
  }

  const parsed = parseRequiredGitHubOAuthConfig(input);
  return {
    provided: true,
    config: parsed.config,
    missingFields: parsed.missingFields,
  };
}

export function getGitHubOAuthConfig(): GitHubOAuthConfig {
  const parsed = parseRequiredGitHubOAuthConfig({
    clientId: process.env.GITHUB_OAUTH_CLIENT_ID,
    clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
    redirectUri: process.env.GITHUB_OAUTH_REDIRECT_URI,
  });

  if (!parsed.config) {
    const envVarNames = parsed.missingFields.map((field) => {
      if (field === 'clientId') return 'GITHUB_OAUTH_CLIENT_ID';
      if (field === 'clientSecret') return 'GITHUB_OAUTH_CLIENT_SECRET';
      return 'GITHUB_OAUTH_REDIRECT_URI';
    });

    throw new Error(`Missing required GitHub OAuth env vars: ${envVarNames.join(', ')}`);
  }

  return parsed.config;
}

export async function getStoredGitHubOAuthConfig(): Promise<GitHubOAuthConfig | null> {
  const rows = await db
    .select()
    .from(agentState)
    .where(eq(agentState.key, GITHUB_OAUTH_CONFIG_KEY))
    .limit(1);

  const value = rows[0]?.value as {
    clientId?: unknown;
    clientSecret?: unknown;
    redirectUri?: unknown;
  } | undefined;

  if (!value) {
    return null;
  }

  const parsed = parseRequiredGitHubOAuthConfig(value);
  return parsed.config;
}

export async function upsertStoredGitHubOAuthConfig(config: GitHubOAuthConfig): Promise<void> {
  const existing = await db
    .select({ id: agentState.id })
    .from(agentState)
    .where(eq(agentState.key, GITHUB_OAUTH_CONFIG_KEY))
    .limit(1);

  const value = {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
  };

  if (existing.length > 0) {
    await db
      .update(agentState)
      .set({
        value,
        updatedAt: new Date(),
      })
      .where(eq(agentState.key, GITHUB_OAUTH_CONFIG_KEY));
    return;
  }

  await db.insert(agentState).values({
    key: GITHUB_OAUTH_CONFIG_KEY,
    value,
  });
}

export async function resolveGitHubOAuthConfigFromStoreOrEnv(): Promise<GitHubOAuthConfig | null> {
  const stored = await getStoredGitHubOAuthConfig();
  if (stored) {
    return stored;
  }

  try {
    return getGitHubOAuthConfig();
  } catch {
    return null;
  }
}

export async function hasStoredOrEnvGitHubOAuthConfig(): Promise<boolean> {
  return (await resolveGitHubOAuthConfigFromStoreOrEnv()) !== null;
}

export function createOAuthState(): string {
  return toBase64Url(randomBytes(32));
}

export function hashOAuthState(state: string): string {
  return createHash('sha256').update(state).digest('hex');
}

export function createPkceChallenge(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = toBase64Url(randomBytes(64));
  const codeChallenge = toBase64Url(createHash('sha256').update(codeVerifier).digest());

  return {
    codeVerifier,
    codeChallenge,
  };
}

export function buildGitHubAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: 'S256',
    scope: 'read:user repo',
  });

  return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeOAuthCode(input: ExchangeOAuthCodeInput): Promise<string> {
  const response = await fetch(GITHUB_ACCESS_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
    }),
  });

  let payload: { access_token?: string; error?: string; error_description?: string };
  try {
    payload = (await response.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };
  } catch {
    throw new Error(`GitHub token exchange failed (${response.status})`);
  }

  if (!response.ok || !payload.access_token) {
    const detail = payload.error_description ?? payload.error ?? 'unknown_error';
    throw new Error(`GitHub token exchange rejected (${response.status}): ${detail}`);
  }

  return payload.access_token;
}

export async function fetchAuthenticatedUser(accessToken: string): Promise<GitHubAuthenticatedUser> {
  const response = await fetch(`${GITHUB_API_BASE_URL}/user`, {
    headers: githubApiHeaders(accessToken),
  });

  if (!response.ok) {
    throw new Error(`GitHub /user request failed (${response.status})`);
  }

  const payload = (await response.json()) as { id?: number; login?: string };
  if (typeof payload.id !== 'number' || typeof payload.login !== 'string' || payload.login.length === 0) {
    throw new Error('GitHub /user response missing required identity fields');
  }

  return {
    id: payload.id,
    login: payload.login,
  };
}

export async function fetchAccessibleRepositories(
  accessToken: string,
  page = 1,
  perPage = 100,
): Promise<GitHubRepository[]> {
  const params = new URLSearchParams({
    affiliation: 'owner,collaborator,organization_member',
    per_page: String(perPage),
    page: String(page),
    sort: 'updated',
  });

  const response = await fetch(`${GITHUB_API_BASE_URL}/user/repos?${params.toString()}`, {
    headers: githubApiHeaders(accessToken),
  });

  if (!response.ok) {
    throw new Error(`GitHub /user/repos request failed (${response.status})`);
  }

  const payload = (await response.json()) as GitHubRepository[];
  if (!Array.isArray(payload)) {
    throw new Error('GitHub /user/repos response was not an array');
  }

  return payload;
}

export async function fetchRepositoryByFullName(
  accessToken: string,
  fullName: string,
): Promise<GitHubRepository> {
  const response = await fetch(`${GITHUB_API_BASE_URL}/repos/${fullName}`, {
    headers: githubApiHeaders(accessToken),
  });

  if (!response.ok) {
    throw new Error(`GitHub /repos/${fullName} request failed (${response.status})`);
  }

  const payload = (await response.json()) as GitHubRepository;
  if (typeof payload.id !== 'number' || typeof payload.full_name !== 'string') {
    throw new Error(`GitHub /repos/${fullName} response missing required fields`);
  }

  return payload;
}
