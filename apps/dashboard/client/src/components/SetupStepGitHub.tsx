import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import type { SetupState } from '../hooks/useSetupState.js';

interface SetupStepGitHubProps {
  setupState: SetupState;
  onComplete: () => void;
  onRefreshSetupState: () => Promise<void>;
}

interface GitHubRepoOption {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  defaultBranch: string;
  permissions: {
    admin: boolean;
    push: boolean;
    pull: boolean;
  };
  canBind: boolean;
}

interface RepoListResponse {
  repos: GitHubRepoOption[];
  boundRepoFullName: string | null;
}

/**
 * Step 2 of 2 in the setup wizard.
 * Enforces real GitHub OAuth connection and repository trust binding.
 */
export function SetupStepGitHub({ setupState, onComplete, onRefreshSetupState }: SetupStepGitHubProps) {
  const [startingOauth, setStartingOauth] = useState(false);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [bindingRepo, setBindingRepo] = useState(false);
  const [repos, setRepos] = useState<GitHubRepoOption[]>([]);
  const [selectedRepoFullName, setSelectedRepoFullName] = useState('');
  const [oauthClientId, setOauthClientId] = useState('');
  const [oauthClientSecret, setOauthClientSecret] = useState('');
  const [oauthRedirectUri, setOauthRedirectUri] = useState(
    () => `${window.location.origin}/setup/github/callback`,
  );
  const [error, setError] = useState<string | null>(null);

  const writableRepos = useMemo(() => repos.filter((repo) => repo.canBind), [repos]);
  const selectedRepo = useMemo(
    () => repos.find((repo) => repo.fullName === selectedRepoFullName),
    [repos, selectedRepoFullName],
  );

  useEffect(() => {
    if (!setupState.githubConnected) {
      setRepos([]);
      setSelectedRepoFullName('');
      return;
    }

    void loadRepos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupState.githubConnected]);

  async function loadRepos() {
    setError(null);
    setLoadingRepos(true);

    try {
      const response = await apiFetch('/api/setup/github/repos');
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? 'Failed to load repositories');
        return;
      }

      const payload = (await response.json()) as RepoListResponse;
      setRepos(payload.repos);

      const defaultSelection = payload.boundRepoFullName
        ?? payload.repos.find((repo) => repo.canBind)?.fullName
        ?? payload.repos[0]?.fullName
        ?? '';

      setSelectedRepoFullName(defaultSelection);
    } catch {
      setError('Connection error while loading repositories');
    } finally {
      setLoadingRepos(false);
    }
  }

  async function handleStartOAuth() {
    setError(null);
    setStartingOauth(true);

    try {
      const clientId = oauthClientId.trim();
      const clientSecret = oauthClientSecret.trim();
      const redirectUri = oauthRedirectUri.trim();
      const providedCount = [clientId, clientSecret, redirectUri].filter((value) => value.length > 0).length;

      if (!setupState.githubOauthConfigured && providedCount === 0) {
        setError('Enter GitHub OAuth Client ID, Client Secret, and Redirect URI to continue.');
        return;
      }

      if (providedCount > 0 && providedCount < 3) {
        setError(
          'Provide clientId, clientSecret, and redirectUri together, or leave all three blank to use saved config.',
        );
        return;
      }

      const requestBody: {
        returnTo: string;
        clientId?: string;
        clientSecret?: string;
        redirectUri?: string;
      } = {
        returnTo: `${window.location.pathname}${window.location.search}`,
      };

      if (providedCount === 3) {
        requestBody.clientId = clientId;
        requestBody.clientSecret = clientSecret;
        requestBody.redirectUri = redirectUri;
      }

      const response = await apiFetch('/api/setup/github/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorPayload = (await response.json()) as { error?: string };
        setError(errorPayload.error ?? 'Failed to start GitHub OAuth flow');
        return;
      }

      const responsePayload = (await response.json()) as { authorizeUrl?: string };
      if (!responsePayload.authorizeUrl) {
        setError('OAuth start response did not include authorizeUrl');
        return;
      }

      window.location.assign(responsePayload.authorizeUrl);
    } catch {
      setError('Connection error while starting OAuth flow');
    } finally {
      setStartingOauth(false);
    }
  }

  async function handleBindRepository() {
    if (!selectedRepoFullName) {
      setError('Select a repository to continue');
      return;
    }

    setError(null);
    setBindingRepo(true);

    try {
      const response = await apiFetch('/api/setup/github/bind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoFullName: selectedRepoFullName }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? 'Failed to bind repository');
        return;
      }

      await onRefreshSetupState();
      onComplete();
    } catch {
      setError('Connection error while binding repository');
    } finally {
      setBindingRepo(false);
    }
  }

  return (
    <div>
      <h2 className="wizard-step-title">Connect GitHub</h2>
      <p className="wizard-step-subtitle">
        Bind a writable repository before enabling self-modification on built-in agent code paths.
      </p>

      <div className="wizard-form">
        {!setupState.githubConnected && (
          <>
            <p className="wizard-step-subtitle">
              {setupState.githubOauthConfigured
                ? 'Saved GitHub OAuth app credentials detected. Leave blank to reuse, or provide new values.'
                : 'Enter your GitHub OAuth app credentials to start account connection.'}
            </p>

            <label className="form-label" htmlFor="github-oauth-client-id">GitHub OAuth Client ID</label>
            <input
              id="github-oauth-client-id"
              type="text"
              value={oauthClientId}
              onChange={(event) => setOauthClientId(event.target.value)}
              placeholder="Iv1...."
              className="form-input"
              autoComplete="off"
              disabled={startingOauth}
            />

            <label className="form-label" htmlFor="github-oauth-client-secret">GitHub OAuth Client Secret</label>
            <input
              id="github-oauth-client-secret"
              type="password"
              value={oauthClientSecret}
              onChange={(event) => setOauthClientSecret(event.target.value)}
              placeholder="Client secret"
              className="form-input"
              autoComplete="off"
              disabled={startingOauth}
            />

            <label className="form-label" htmlFor="github-oauth-redirect-uri">GitHub OAuth Redirect URI</label>
            <input
              id="github-oauth-redirect-uri"
              type="text"
              value={oauthRedirectUri}
              onChange={(event) => setOauthRedirectUri(event.target.value)}
              placeholder={`${window.location.origin}/setup/github/callback`}
              className="form-input"
              autoComplete="off"
              disabled={startingOauth}
            />

            <button
              type="button"
              onClick={() => void handleStartOAuth()}
              disabled={startingOauth}
              className="btn-primary"
            >
              {startingOauth ? 'Redirecting to GitHub...' : 'Connect GitHub Account'}
            </button>
          </>
        )}

        {setupState.githubConnected && (
          <>
            <p className="wizard-step-subtitle">
              Connected as <strong>{setupState.githubUsername ?? 'unknown-user'}</strong>
            </p>

            {setupState.githubTrustBound && setupState.githubRepoFullName && (
              <p className="wizard-step-subtitle">
                Currently bound repository: <strong>{setupState.githubRepoFullName}</strong>
              </p>
            )}

            <button
              type="button"
              onClick={() => void loadRepos()}
              disabled={loadingRepos || bindingRepo}
              className="wizard-skip-btn"
            >
              {loadingRepos ? 'Refreshing repositories...' : 'Refresh Repository List'}
            </button>

            {loadingRepos && <p className="wizard-step-subtitle">Loading accessible repositories...</p>}

            {!loadingRepos && repos.length === 0 && (
              <p className="wizard-step-subtitle">
                No repositories were returned for this account.
              </p>
            )}

            {!loadingRepos && repos.length > 0 && (
              <>
                <select
                  className="form-input"
                  value={selectedRepoFullName}
                  onChange={(event) => setSelectedRepoFullName(event.target.value)}
                  disabled={bindingRepo}
                >
                  {repos.map((repo) => (
                    <option key={repo.id} value={repo.fullName}>
                      {repo.fullName}
                      {repo.canBind ? '' : ' (read-only)'}
                    </option>
                  ))}
                </select>

                {writableRepos.length === 0 && (
                  <p className="wizard-error">
                    No writable repositories are available. GitHub trust binding requires push or admin permission.
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => void handleBindRepository()}
                  disabled={
                    bindingRepo
                    || loadingRepos
                    || !selectedRepo
                    || !selectedRepo.canBind
                  }
                  className="btn-primary"
                >
                  {bindingRepo ? 'Binding repository...' : 'Bind Repository'}
                </button>
              </>
            )}
          </>
        )}

        {error && <p className="wizard-error">{error}</p>}
      </div>
    </div>
  );
}
