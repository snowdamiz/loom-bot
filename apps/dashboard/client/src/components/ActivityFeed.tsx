import type { ActivityItem } from '../hooks/useActivityFeed.js';
import { useActivityFeed } from '../hooks/useActivityFeed.js';
import { ActivityEntry } from './ActivityEntry.js';

interface ActivityFeedProps {
  type?: string;
  search?: string;
  liveEntries: ActivityItem[];
}

/**
 * DASH-02: Paginated activity feed with live SSE entries at the top and
 * cursor-based "Load more" pagination at the bottom.
 */
export function ActivityFeed({ type, search, liveEntries }: ActivityFeedProps) {
  const { entries, isLoading, isError, error, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useActivityFeed({ type, search });

  if (isLoading) {
    return (
      <div className="activity-feed">
        {/* Skeleton rows on initial load */}
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="activity-entry-skeleton">
            <div className="skeleton skeleton-icon" />
            <div className="skeleton skeleton-text" />
            <div className="skeleton skeleton-badge" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="activity-feed">
        <div className="activity-error">
          <span>Failed to load activity: {(error as Error).message}</span>
          <button
            className="btn btn-ghost"
            onClick={() => void fetchNextPage()}
            style={{ marginLeft: 8 }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const isEmpty = entries.length === 0 && liveEntries.length === 0;

  return (
    <div className="activity-feed">
      {/* Live SSE entries section — at top, separate from paginated */}
      {liveEntries.length > 0 && (
        <div className="activity-live-section">
          {liveEntries.map((entry) => (
            <ActivityEntry key={`live-${entry.id}`} entry={entry} isLive />
          ))}
        </div>
      )}

      {/* Paginated entries */}
      {isEmpty ? (
        <div className="activity-empty">
          <span>No activity yet</span>
        </div>
      ) : (
        <>
          {entries.map((entry) => (
            <ActivityEntry key={entry.id} entry={entry} />
          ))}

          {/* Load more button */}
          <div className="activity-load-more">
            {hasNextPage ? (
              <button
                className="btn btn-ghost"
                onClick={() => void fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? (
                  <span className="btn-loading">
                    <span className="spinner" />
                    Loading…
                  </span>
                ) : (
                  'Load more'
                )}
              </button>
            ) : entries.length > 0 ? (
              <span className="activity-end-label">All entries loaded</span>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
