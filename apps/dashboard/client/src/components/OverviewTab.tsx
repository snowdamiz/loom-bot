import { useAgentStatus } from '../hooks/useAgentData.js';
import { KillSwitchButton } from './KillSwitchButton.js';
import { SelfExtensionCard } from './SelfExtensionCard.js';
import { getToken } from '../lib/api.js';

interface OverviewTabProps {
  onViewActivity: () => void;
}

/**
 * Overview tab: compact status card grid with real-time agent data.
 * Reads from TanStack Query cache (populated by SSE + polling fallback).
 */
export function OverviewTab({ onViewActivity }: OverviewTabProps) {
  const token = getToken() ?? '';
  const { data: status, isLoading, isError, error, refetch } = useAgentStatus(token);

  if (isLoading) {
    return <OverviewSkeleton />;
  }

  if (isError) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '32px' }}>
        <p style={{ color: '#ef4444', margin: '0 0 12px 0' }}>
          {error instanceof Error ? error.message : 'Failed to load agent status'}
        </p>
        <button className="btn btn-ghost" onClick={() => void refetch()}>
          Retry
        </button>
      </div>
    );
  }

  const isHalted = status?.isHalted ?? false;
  const uptime = status?.uptime ?? null;
  const activeGoals = status?.activeGoals ?? [];
  const topGoal = activeGoals[0] ?? null;
  const extraGoals = activeGoals.length > 1 ? activeGoals.length - 1 : 0;
  const systemStatus = status?.systemStatus ?? 'unknown';

  return (
    <div className="card-grid">
      <SelfExtensionCard />

      {/* Status card */}
      <div className="card">
        <p className="card-title">Agent Status</p>
        <div
          className="status-badge"
          style={{ marginBottom: '12px' }}
        >
          <span className={`status-dot ${isHalted ? 'halted' : 'alive'}`} />
          <span className="text-large">{isHalted ? 'Halted' : 'Running'}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: '13px', color: '#6b7280' }}>
            <strong>System:</strong> {systemStatus}
          </div>
          {uptime !== null && (
            <div style={{ fontSize: '13px', color: '#6b7280' }}>
              <strong>Uptime:</strong> {formatUptime(uptime)}
            </div>
          )}
          {status?.activatedAt && isHalted && (
            <div style={{ fontSize: '13px', color: '#6b7280' }}>
              <strong>Halted at:</strong> {formatTimestamp(status.activatedAt)}
            </div>
          )}
        </div>
      </div>

      {/* Current goal card */}
      <div className="card">
        <p className="card-title">Current Goal</p>
        {topGoal ? (
          <div>
            <p style={{ margin: '0 0 6px 0', fontSize: '14px', lineHeight: '1.4' }}>
              {topGoal.description}
            </p>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: '600',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {topGoal.priority}
              </span>
              {extraGoals > 0 && (
                <span style={{ fontSize: '12px', color: '#6b7280' }}>
                  +{extraGoals} more
                </span>
              )}
            </div>
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: '14px', color: '#9ca3af' }}>
            No active goals
          </p>
        )}
      </div>

      {/* Recent activity card */}
      <div className="card">
        <p className="card-title">Recent Activity</p>
        <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#9ca3af' }}>
          Real-time activity feed available in Activity tab.
        </p>
        <button
          className="btn btn-ghost"
          style={{ fontSize: '13px', padding: '6px 12px' }}
          onClick={onViewActivity}
        >
          View all activity
        </button>
      </div>

      {/* Kill switch card */}
      <div className="card">
        <p className="card-title">Emergency Control</p>
        <KillSwitchButton isHalted={isHalted} haltReason={status?.haltReason} />
      </div>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="card-grid">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="card">
          <div className="skeleton" style={{ width: '60px', height: '12px', marginBottom: '12px' }} />
          <div className="skeleton" style={{ height: '24px', marginBottom: '8px' }} />
          <div className="skeleton" style={{ width: '70%', height: '14px' }} />
        </div>
      ))}
    </div>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return `${hours}h ${remainingMinutes}m`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days}d ${remainingHours}h`;
}

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return ts;
  }
}
