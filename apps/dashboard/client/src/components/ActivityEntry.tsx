import { useState, useEffect } from 'react';
import type { ActivityItem } from '../hooks/useActivityFeed.js';

/**
 * Returns a relative time string for a given ISO date.
 * < 1 min: "just now"
 * < 60 min: "Xm ago"
 * < 24 hours: "Xh ago"
 * >= 24 hours: "Feb 18, 14:30"
 */
function timeAgo(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  if (isNaN(then)) return dateString;
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const d = new Date(dateString);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * Type-specific icon (inline SVG).
 */
function TypeIcon({ type }: { type: ActivityItem['type'] }) {
  switch (type) {
    case 'tool_call':
      return (
        // Wrench
        <svg
          width="14"
          height="14"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="entry-type-icon"
          aria-label="Tool call"
        >
          <path
            d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l.8-.8a2 2 0 0 0-2.4-3.1l-.8.8-.6-.6 2.1-2.1a4 4 0 0 0-5.6 5.6L4 16.6a1.4 1.4 0 0 0 2 2L13.7 11a4 4 0 0 0 5.6-5.6l-2.1 2.1-.5-1.2z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'decision':
      return (
        // Brain-like icon
        <svg
          width="14"
          height="14"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="entry-type-icon"
          aria-label="Decision"
        >
          <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M7 10h6M10 7v6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'wallet':
      return (
        // Wallet icon
        <svg
          width="14"
          height="14"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="entry-type-icon"
          aria-label="Wallet"
        >
          <rect x="2" y="5" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M2 9h16"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx="14" cy="13" r="1" fill="currentColor" />
        </svg>
      );
    case 'planning':
      return (
        // Cycle/arrows icon
        <svg
          width="14"
          height="14"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="entry-type-icon"
          aria-label="Planning"
        >
          <path
            d="M4 10a6 6 0 0 1 6-6 6 6 0 0 1 4.24 1.76M16 10a6 6 0 0 1-10.24 4.24"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path d="M14 6l2-2 2 2M4 14l-2 2-2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

/**
 * Renders decision log reasoning in a readable format.
 * Handles string, { steps: [] }, and arbitrary JSON.
 */
function DecisionReasoning({ reasoning }: { reasoning: unknown }) {
  if (typeof reasoning === 'string') {
    return (
      <div className="decision-reasoning">
        <p className="reasoning-text">{reasoning}</p>
      </div>
    );
  }

  if (
    reasoning !== null &&
    typeof reasoning === 'object' &&
    !Array.isArray(reasoning) &&
    'steps' in reasoning &&
    Array.isArray((reasoning as { steps: unknown[] }).steps)
  ) {
    const steps = (reasoning as { steps: unknown[] }).steps;
    return (
      <div className="decision-reasoning">
        <ol className="reasoning-steps">
          {steps.map((step, i) => (
            <li key={i}>{typeof step === 'string' ? step : JSON.stringify(step, null, 2)}</li>
          ))}
        </ol>
      </div>
    );
  }

  // Fallback: formatted JSON
  return (
    <div className="decision-reasoning">
      <pre className="reasoning-json">{JSON.stringify(reasoning, null, 2)}</pre>
    </div>
  );
}

/**
 * Expanded detail view for tool_call entries.
 */
function ToolCallDetail({ details }: { details: Record<string, unknown> }) {
  const [showRaw, setShowRaw] = useState(false);
  return (
    <div className="entry-detail">
      <dl className="detail-grid">
        <dt>Tool</dt>
        <dd>{String(details['toolName'] ?? '—')}</dd>
        <dt>Status</dt>
        <dd>{String(details['status'] ?? '—')}</dd>
        {details['durationMs'] != null && (
          <>
            <dt>Duration</dt>
            <dd>{String(details['durationMs'])}ms</dd>
          </>
        )}
        {Boolean(details['error']) && (
          <>
            <dt>Error</dt>
            <dd className="detail-error">{String(details['error'])}</dd>
          </>
        )}
      </dl>
      {details['input'] != null && (
        <div className="detail-section">
          <div className="detail-section-label">Input</div>
          <pre className="detail-code">{JSON.stringify(details['input'], null, 2)}</pre>
        </div>
      )}
      {details['output'] != null && (
        <div className="detail-section">
          <div className="detail-section-label">Output</div>
          <pre className="detail-code">{JSON.stringify(details['output'], null, 2)}</pre>
        </div>
      )}
      <button className="btn-raw-toggle" onClick={() => setShowRaw((v) => !v)}>
        {showRaw ? 'Hide raw' : 'Show raw'}
      </button>
      {showRaw && (
        <pre className="detail-code detail-raw">{JSON.stringify(details, null, 2)}</pre>
      )}
    </div>
  );
}

/**
 * Expanded detail view for decision entries (DASH-07).
 */
function DecisionDetail({ details }: { details: Record<string, unknown> }) {
  const [showRaw, setShowRaw] = useState(false);
  const reasoning = details['reasoning'];
  return (
    <div className="entry-detail">
      <dl className="detail-grid">
        <dt>Decision</dt>
        <dd>{String(details['decision'] ?? '—')}</dd>
        {details['cycleId'] != null && (
          <>
            <dt>Cycle ID</dt>
            <dd>{String(details['cycleId'])}</dd>
          </>
        )}
      </dl>
      {reasoning != null && (
        <div className="detail-section">
          <div className="detail-section-label">LLM Reasoning</div>
          <DecisionReasoning reasoning={reasoning} />
        </div>
      )}
      <button className="btn-raw-toggle" onClick={() => setShowRaw((v) => !v)}>
        {showRaw ? 'Hide raw' : 'Show raw'}
      </button>
      {showRaw && (
        <pre className="detail-code detail-raw">{JSON.stringify(details, null, 2)}</pre>
      )}
    </div>
  );
}

/**
 * Expanded detail view for wallet transaction entries.
 */
function WalletDetail({ details }: { details: Record<string, unknown> }) {
  const [showRaw, setShowRaw] = useState(false);
  return (
    <div className="entry-detail">
      <dl className="detail-grid">
        <dt>Amount</dt>
        <dd className="detail-amount">
          {String(details['amountLamports'] ?? '0')} lamports (
          {details['tokenMint'] === 'sol'
            ? `${(parseInt(String(details['amountLamports'] ?? '0'), 10) / 1_000_000_000).toFixed(6)} SOL`
            : String(details['tokenMint'] ?? '')}
          )
        </dd>
        <dt>Purpose</dt>
        <dd>{String(details['purpose'] ?? '—')}</dd>
        <dt>Status</dt>
        <dd>{String(details['status'] ?? '—')}</dd>
        {Boolean(details['destinationAddress']) && (
          <>
            <dt>To</dt>
            <dd className="detail-address">{String(details['destinationAddress'])}</dd>
          </>
        )}
        {Boolean(details['txSignature']) && (
          <>
            <dt>Signature</dt>
            <dd className="detail-address">{String(details['txSignature'])}</dd>
          </>
        )}
        {Boolean(details['rejectionReason']) && (
          <>
            <dt>Rejection Reason</dt>
            <dd className="detail-error">{String(details['rejectionReason'])}</dd>
          </>
        )}
      </dl>
      <button className="btn-raw-toggle" onClick={() => setShowRaw((v) => !v)}>
        {showRaw ? 'Hide raw' : 'Show raw'}
      </button>
      {showRaw && (
        <pre className="detail-code detail-raw">{JSON.stringify(details, null, 2)}</pre>
      )}
    </div>
  );
}

/**
 * Expanded detail view for planning cycle entries.
 */
function PlanningDetail({ details }: { details: Record<string, unknown> }) {
  const [showRaw, setShowRaw] = useState(false);
  return (
    <div className="entry-detail">
      <dl className="detail-grid">
        <dt>Status</dt>
        <dd>{String(details['status'] ?? '—')}</dd>
        {details['completedAt'] != null && (
          <>
            <dt>Completed</dt>
            <dd>{String(details['completedAt'])}</dd>
          </>
        )}
      </dl>
      {details['goals'] != null && (
        <div className="detail-section">
          <div className="detail-section-label">Goals</div>
          <pre className="detail-code">{JSON.stringify(details['goals'], null, 2)}</pre>
        </div>
      )}
      {details['outcomes'] != null && (
        <div className="detail-section">
          <div className="detail-section-label">Outcomes</div>
          <pre className="detail-code">{JSON.stringify(details['outcomes'], null, 2)}</pre>
        </div>
      )}
      <button className="btn-raw-toggle" onClick={() => setShowRaw((v) => !v)}>
        {showRaw ? 'Hide raw' : 'Show raw'}
      </button>
      {showRaw && (
        <pre className="detail-code detail-raw">{JSON.stringify(details, null, 2)}</pre>
      )}
    </div>
  );
}

interface ActivityEntryProps {
  entry: ActivityItem;
  isLive?: boolean;
}

/**
 * DASH-02, DASH-07: Expandable activity entry.
 * Compact one-liner by default, click to expand full details.
 * Decision entries show LLM reasoning in expanded view.
 */
export function ActivityEntry({ entry, isLive = false }: ActivityEntryProps) {
  const [expanded, setExpanded] = useState(false);
  const [newBadgeVisible, setNewBadgeVisible] = useState(isLive);

  // "NEW" badge fades after 5 seconds
  useEffect(() => {
    if (!isLive) return;
    const t = setTimeout(() => setNewBadgeVisible(false), 5000);
    return () => clearTimeout(t);
  }, [isLive]);

  const isError =
    entry.type === 'tool_call' &&
    (entry.details['status'] === 'failed' || entry.details['error'] != null);

  const durationMs = entry.details['durationMs'] as number | undefined;
  // Cost is not currently stored per tool call but future-proofed
  const costUsd = entry.details['costUsd'] as number | undefined;

  return (
    <div
      className={[
        'activity-entry',
        expanded ? 'activity-entry--expanded' : '',
        isLive ? 'activity-entry--live' : '',
        isError ? 'activity-entry--error' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Compact row */}
      <button
        className="activity-entry-row"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="entry-icon">
          <TypeIcon type={entry.type} />
        </span>

        <span className="entry-timestamp">{timeAgo(entry.timestamp)}</span>

        <span className="entry-summary">{entry.summary}</span>

        <span className="entry-badges">
          {newBadgeVisible && <span className="badge badge-new">NEW</span>}
          {durationMs != null && (
            <span className="badge badge-duration">{durationMs}ms</span>
          )}
          {costUsd != null && (
            <span className="badge badge-cost">${costUsd.toFixed(4)}</span>
          )}
        </span>

        {/* Expand chevron */}
        <span className={`entry-chevron ${expanded ? 'entry-chevron--open' : ''}`}>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M2 4l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {/* Expandable detail */}
      <div
        className="activity-entry-detail-wrap"
        style={{
          maxHeight: expanded ? '2000px' : '0',
          overflow: 'hidden',
          transition: 'max-height 0.2s ease',
        }}
      >
        {expanded && (
          <div className="activity-entry-detail-inner">
            {entry.type === 'tool_call' && <ToolCallDetail details={entry.details} />}
            {entry.type === 'decision' && <DecisionDetail details={entry.details} />}
            {entry.type === 'wallet' && <WalletDetail details={entry.details} />}
            {entry.type === 'planning' && <PlanningDetail details={entry.details} />}
          </div>
        )}
      </div>
    </div>
  );
}
