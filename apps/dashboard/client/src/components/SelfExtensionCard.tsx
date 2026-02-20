import { useState } from 'react';
import { getToken } from '../lib/api.js';
import { useSelfExtensionStatus } from '../hooks/useSelfExtensionStatus.js';
import { useSelfExtensionPromotionControl } from '../hooks/useAgentData.js';

export function SelfExtensionCard() {
  const token = getToken() ?? '';
  const {
    data: status,
    isLoading,
    isError,
    error,
    refetch,
  } = useSelfExtensionStatus(token);
  const promotionControl = useSelfExtensionPromotionControl();
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="card self-extension-card">
        <p className="card-title">Self-Extension Pipeline</p>
        <div className="skeleton" style={{ height: '18px', marginBottom: '10px' }} />
        <div className="skeleton" style={{ height: '14px', width: '70%' }} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="card self-extension-card">
        <p className="card-title">Self-Extension Pipeline</p>
        <p className="text-error" style={{ margin: '0 0 10px 0' }}>
          {error instanceof Error ? error.message : 'Failed to load self-extension status'}
        </p>
        <button className="btn btn-ghost" onClick={() => void refetch()}>
          Retry
        </button>
      </div>
    );
  }

  const promotionPaused = status?.promotionPaused ?? false;
  const pipelineStatus = status?.pipelineStatus ?? 'unknown';
  const rollbackStatus = status?.rollback.status ?? 'none';
  const latestEventType = status?.latestEvent.eventType ?? 'none';
  const pauseActionLabel = promotionPaused ? 'Resume Promotion' : 'Pause Promotion';

  const submitToggle = async () => {
    setActionError(null);
    const action: 'pause' | 'resume' = promotionPaused ? 'resume' : 'pause';
    const payload = {
      action,
      reason: reason.trim() || undefined,
    };

    try {
      const response = await promotionControl.mutateAsync(payload);
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Failed to ${action} promotion`);
      }
      setReason('');
      await refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="card self-extension-card">
      <p className="card-title">Self-Extension Pipeline</p>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <span className={`status-pill ${promotionPaused ? 'paused' : 'running'}`}>
          Promotion {promotionPaused ? 'Paused' : 'Running'}
        </span>
        <span className={`status-pill ${pipelineStatus === 'health_failed' || pipelineStatus === 'rollback_failed' ? 'warning' : 'running'}`}>
          {pipelineStatus}
        </span>
      </div>

      <div className="kv-list">
        <div className="kv-row">
          <span className="kv-key">Latest PR</span>
          <span className="kv-value">
            {status?.pullRequestUrl ? (
              <a href={status.pullRequestUrl} target="_blank" rel="noreferrer">
                #{status.pullRequestNumber ?? 'n/a'}
              </a>
            ) : (
              'none'
            )}
          </span>
        </div>
        <div className="kv-row">
          <span className="kv-key">Head SHA</span>
          <span className="kv-value mono">{shortSha(status?.headSha)}</span>
        </div>
        <div className="kv-row">
          <span className="kv-key">Verification</span>
          <span className="kv-value">
            {status?.verificationOverallStatus ?? 'n/a'}
            {status?.verificationFailedStage ? ` (${status.verificationFailedStage})` : ''}
          </span>
        </div>
        <div className="kv-row">
          <span className="kv-key">Rollback</span>
          <span className="kv-value">
            {rollbackStatus}
            {status?.rollback.targetBaselineSha
              ? ` → ${shortSha(status.rollback.targetBaselineSha)}`
              : ''}
          </span>
        </div>
        <div className="kv-row">
          <span className="kv-key">Baseline</span>
          <span className="kv-value mono">{shortSha(status?.knownGoodBaseline.sha)}</span>
        </div>
        <div className="kv-row">
          <span className="kv-key">Latest Event</span>
          <span className="kv-value">
            {latestEventType}
            {status?.latestEvent.createdAt
              ? ` @ ${formatTimestamp(status.latestEvent.createdAt)}`
              : ''}
          </span>
        </div>
      </div>

      <div className="action-row">
        <label className="form-label" htmlFor="promotion-reason">
          Operator Reason
        </label>
        <input
          id="promotion-reason"
          className="form-input"
          placeholder={promotionPaused ? 'Reason for resuming promotion' : 'Reason for pausing promotion'}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button
          className={`btn ${promotionPaused ? 'btn-success' : 'btn-danger'}`}
          disabled={promotionControl.isPending || (!promotionPaused && reason.trim().length === 0)}
          onClick={() => void submitToggle()}
        >
          {promotionControl.isPending ? 'Saving...' : pauseActionLabel}
        </button>
      </div>

      {actionError && <p className="text-error" style={{ margin: '10px 0 0 0' }}>{actionError}</p>}
      <p className="form-help" style={{ marginTop: '10px' }}>
        Pause controls only self-extension promotion flow and does not toggle the global kill switch.
      </p>
    </div>
  );
}

function shortSha(value: string | null | undefined): string {
  if (!value) return 'n/a';
  return value.length > 12 ? value.slice(0, 12) : value;
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
