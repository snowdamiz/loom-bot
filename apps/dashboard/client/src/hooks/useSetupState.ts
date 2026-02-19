import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../lib/api.js';

export type SetupState = {
  openrouterKeySet: boolean;
  githubConnected: boolean;
  githubUsername: string | null;
  setupCompletedAt: string | null;
  complete: boolean;
};

/**
 * Fetches the current setup wizard state from GET /api/setup.
 * Returns whether OpenRouter key is set and GitHub is connected.
 */
export function useSetupState() {
  return useQuery<SetupState>({
    queryKey: ['setup-state'],
    queryFn: () => apiJson<SetupState>('/api/setup'),
    staleTime: 5_000,
    retry: 1,
  });
}
