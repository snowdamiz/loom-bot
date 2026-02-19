import { useState } from 'react';
import { useKillSwitch } from '../hooks/useAgentData.js';

interface KillSwitchButtonProps {
  isHalted: boolean;
  haltReason?: string | null;
}

/**
 * Kill switch button with confirmation dialog.
 * Shows "Kill Switch" when running, "Resume Agent" when halted.
 * Requires a reason (non-empty) before confirming.
 */
export function KillSwitchButton({ isHalted, haltReason }: KillSwitchButtonProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);

  const mutation = useKillSwitch();

  function openDialog() {
    setReason('');
    setReasonError(null);
    setShowDialog(true);
  }

  function closeDialog() {
    if (mutation.isPending) return;
    setShowDialog(false);
    mutation.reset();
  }

  async function handleConfirm() {
    if (!reason.trim()) {
      setReasonError('Reason is required');
      return;
    }
    setReasonError(null);

    try {
      await mutation.mutateAsync({
        action: isHalted ? 'deactivate' : 'activate',
        reason: reason.trim(),
      });
      setShowDialog(false);
    } catch {
      // Error stays in mutation.error — dialog stays open for retry
    }
  }

  const actionLabel = isHalted ? 'Resume Agent' : 'Kill Switch';
  const dialogTitle = isHalted ? 'Resume Agent?' : 'Halt Agent?';
  const dialogDesc = isHalted
    ? 'This will resume all agent activity.'
    : 'This will halt all agent activity.';

  return (
    <>
      {isHalted && haltReason && (
        <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 12px 0' }}>
          <strong>Halt reason:</strong> {haltReason}
        </p>
      )}

      <button
        onClick={openDialog}
        className={`btn ${isHalted ? 'btn-success' : 'btn-danger'}`}
        style={{ width: '100%', padding: '10px' }}
      >
        {actionLabel}
      </button>

      {showDialog && (
        <div className="modal-backdrop" onClick={closeDialog}>
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
          >
            <h2 id="dialog-title" className="modal-title">
              {dialogTitle}
            </h2>
            <p className="modal-desc">{dialogDesc}</p>

            <label className="form-label" htmlFor="kill-reason">
              Reason <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              id="kill-reason"
              type="text"
              className="form-input"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (e.target.value.trim()) setReasonError(null);
              }}
              placeholder="Brief reason for this action"
              autoFocus
              disabled={mutation.isPending}
              maxLength={500}
            />
            {reasonError && <p className="error-msg">{reasonError}</p>}
            {mutation.isError && (
              <p className="error-msg">
                {mutation.error instanceof Error
                  ? mutation.error.message
                  : 'Request failed. Please try again.'}
              </p>
            )}

            <div className="btn-row">
              <button
                className="btn btn-ghost"
                onClick={closeDialog}
                disabled={mutation.isPending}
              >
                Cancel
              </button>
              <button
                className={`btn ${isHalted ? 'btn-success' : 'btn-danger'}`}
                onClick={() => void handleConfirm()}
                disabled={mutation.isPending}
              >
                {mutation.isPending ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
