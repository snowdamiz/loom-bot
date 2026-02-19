import { useInfiniteQuery } from '@tanstack/react-query';
import { apiJson } from '../lib/api.js';

/**
 * Normalized activity item shape — all source types map to this.
 */
export interface ActivityItem {
  id: number;
  type: 'tool_call' | 'decision' | 'wallet' | 'planning';
  timestamp: string; // ISO date string
  summary: string; // compact one-liner
  details: Record<string, unknown>; // full data for expanded view
}

interface ApiRow {
  id: number;
  [key: string]: unknown;
}

interface ActivityPage {
  rows: ActivityItem[];
  nextCursor: number | null;
}

interface RawActivityPage {
  rows: ApiRow[];
  nextCursor: number | null;
  type: string;
}

/**
 * Normalize a raw API row into a common ActivityItem shape.
 * The API returns raw rows from different tables depending on the type filter.
 */
function normalizeRow(row: ApiRow, sourceType: string): ActivityItem {
  const type = mapType(sourceType);

  switch (type) {
    case 'decision': {
      const decision = (row['decision'] as string | undefined) ?? 'Decision';
      const createdAt = (row['createdAt'] as string | undefined) ?? new Date().toISOString();
      return {
        id: row.id,
        type: 'decision',
        timestamp: createdAt,
        summary: decision.length > 120 ? decision.slice(0, 120) + '…' : decision,
        details: row as Record<string, unknown>,
      };
    }
    case 'wallet': {
      const purpose = (row['purpose'] as string | undefined) ?? 'Transaction';
      const amount = (row['amountLamports'] as string | undefined) ?? '0';
      const status = (row['status'] as string | undefined) ?? 'submitted';
      const tokenMint = (row['tokenMint'] as string | undefined) ?? 'sol';
      const amountDisplay =
        tokenMint === 'sol'
          ? `${(parseInt(amount, 10) / 1_000_000_000).toFixed(4)} SOL`
          : `${amount} ${tokenMint.slice(0, 6)}…`;
      const createdAt = (row['createdAt'] as string | undefined) ?? new Date().toISOString();
      return {
        id: row.id,
        type: 'wallet',
        timestamp: createdAt,
        summary: `${amountDisplay} — ${purpose} (${status})`,
        details: row as Record<string, unknown>,
      };
    }
    case 'planning': {
      const status = (row['status'] as string | undefined) ?? 'active';
      const startedAt = (row['startedAt'] as string | undefined) ?? new Date().toISOString();
      const goals = row['goals'];
      let goalSummary = 'Planning cycle';
      if (Array.isArray(goals) && goals.length > 0) {
        const first = goals[0] as { description?: string };
        if (first?.description) {
          goalSummary = `Planning: ${first.description}`;
        }
      }
      return {
        id: row.id,
        type: 'planning',
        timestamp: startedAt,
        summary: `${goalSummary} (${status})`,
        details: row as Record<string, unknown>,
      };
    }
    case 'tool_call':
    default: {
      const toolName = (row['toolName'] as string | undefined) ?? 'unknown';
      const status = (row['status'] as string | undefined) ?? 'started';
      const startedAt = (row['startedAt'] as string | undefined) ?? new Date().toISOString();
      const durationMs = row['durationMs'] as number | undefined;
      const durationStr = durationMs != null ? ` (${durationMs}ms)` : '';
      return {
        id: row.id,
        type: 'tool_call',
        timestamp: startedAt,
        summary: `${toolName} — ${status}${durationStr}`,
        details: row as Record<string, unknown>,
      };
    }
  }
}

function mapType(apiType: string): ActivityItem['type'] {
  switch (apiType) {
    case 'decisions':
      return 'decision';
    case 'wallet':
      return 'wallet';
    case 'planning':
      return 'planning';
    default:
      return 'tool_call';
  }
}

interface UseActivityFeedOptions {
  type?: string; // filter: 'tool_calls' | 'decisions' | 'wallet' | 'planning' | undefined (all)
  search?: string;
}

/**
 * DASH-02: Cursor-paginated activity feed via TanStack useInfiniteQuery.
 * Normalizes raw API rows into ActivityItem shape.
 */
export function useActivityFeed({ type, search }: UseActivityFeedOptions) {
  const query = useInfiniteQuery<ActivityPage, Error>({
    queryKey: ['activity-feed', type, search],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (pageParam != null) params.set('cursor', String(pageParam));
      params.set('limit', '50');
      if (type) params.set('type', type);
      if (search) params.set('search', search);

      const raw = await apiJson<RawActivityPage>(`/api/activity?${params.toString()}`);
      const sourceType = type ?? 'tool_calls';
      const rows = raw.rows.map((row) => normalizeRow(row, sourceType));
      return { rows, nextCursor: raw.nextCursor };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as number | undefined,
  });

  const entries = query.data?.pages.flatMap((p) => p.rows) ?? [];

  return { ...query, entries };
}
