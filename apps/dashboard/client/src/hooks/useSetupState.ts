import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../lib/api.js';

export type SetupState = {
  openrouterKeySet: boolean;
  githubConnected: boolean;
  githubUserId: string | null;
  githubUsername: string | null;
  githubTokenCredentialSet: boolean;
  githubRepoId: string | null;
  githubRepoFullName: string | null;
  githubRepoDefaultBranch: string | null;
  githubRepoValidatedAt: string | null;
  githubTrustBound: boolean;
  setupCompletedAt: string | null;
  complete: boolean;
};

/**
 * Fetches the current setup wizard state from GET /api/setup.
 * Returns setup completion plus GitHub trust-binding metadata.
 */
export function useSetupState() {
  return useQuery<SetupState>({
    queryKey: ['setup-state'],
    queryFn: () => apiJson<SetupState>('/api/setup'),
    staleTime: 5_000,
    retry: 1,
  });
}
