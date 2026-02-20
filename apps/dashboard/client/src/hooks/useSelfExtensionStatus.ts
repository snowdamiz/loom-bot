import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../lib/api.js';

export interface SelfExtensionStatus {
  promotionPaused: boolean;
  promotionPauseReason: string | null;
  promotionPauseUpdatedBy: string | null;
  promotionPauseUpdatedAt: string | null;
  pipelineStatus: string;
  lastRunId: string | null;
  branchName: string | null;
  headSha: string | null;
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;
  healthDeadlineAt: string | null;
  healthFailureReason: string | null;
  verificationOverallStatus: string | null;
  verificationFailedStage: string | null;
  rollback: {
    attempted: boolean;
    status: string | null;
    reason: string | null;
    targetBaselineSha: string | null;
    runId: string | null;
    pullRequestNumber: number | null;
    pullRequestUrl: string | null;
  };
  knownGoodBaseline: {
    sha: string | null;
    confirmedAt: string | null;
    restoredAt: string | null;
    sourceRunId: string | null;
  };
  latestEvent: {
    id: number | null;
    runId: string | null;
    stage: string | null;
    eventType: string | null;
    createdAt: string | null;
    payload: Record<string, unknown> | null;
  };
}

export function useSelfExtensionStatus(token: string) {
  return useQuery<SelfExtensionStatus>({
    queryKey: ['self-extension-status'],
    queryFn: () => apiJson<SelfExtensionStatus>('/api/self-extension'),
    refetchInterval: 5000,
    staleTime: 2000,
    enabled: !!token,
  });
}
