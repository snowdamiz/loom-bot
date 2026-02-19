import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiJson, apiFetch } from '../lib/api.js';
import type { AgentStatus } from './useSSE.js';

/**
 * TanStack Query hook for agent status.
 * Polls every 5s as fallback when SSE misses updates.
 */
export function useAgentStatus(token: string) {
  return useQuery<AgentStatus>({
    queryKey: ['agent-status'],
    queryFn: () => apiJson<AgentStatus>('/api/status'),
    refetchInterval: 5000,
    staleTime: 2000,
    enabled: !!token,
  });
}

/**
 * TanStack Query mutation for kill switch control.
 * Invalidates agent-status cache on success.
 */
export function useKillSwitch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: { action: 'activate' | 'deactivate'; reason: string }) =>
      apiFetch('/api/kill-switch', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agent-status'] });
    },
  });
}
