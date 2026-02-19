import { useState } from 'react';
import { apiFetch } from '../lib/api.js';

interface SetupStepGitHubProps {
  onComplete: () => void;
}

/**
 * Step 2 of 2 in the setup wizard.
 * Connects GitHub account (stubbed — real OAuth TBD).
 * Both "Connect GitHub" and "Skip for Now" mark GitHub as connected via the stub API.
 */
export function SetupStepGitHub({ onComplete }: SetupStepGitHubProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markGitHubConnected() {
    setError(null);
    setLoading(true);
    try {
      const response = await apiFetch('/api/setup/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'manual-setup' }),
      });

      if (response.ok) {
        onComplete();
      } else {
        const data = (await response.json()) as { error?: string };
        setError(data.error ?? 'Failed to connect GitHub');
      }
    } catch {
      setError('Connection error — is the dashboard server running?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 className="wizard-step-title">Connect GitHub</h2>
      <p className="wizard-step-subtitle">
        For safe self-evolution. The agent uses GitHub branches and PRs to modify its own code without breaking things.
      </p>
      <div className="wizard-form">
        <button
          type="button"
          onClick={() => void markGitHubConnected()}
          disabled={loading}
          className="btn-primary"
        >
          {loading ? 'Connecting...' : 'Connect GitHub Account'}
        </button>
        {error && <p className="wizard-error">{error}</p>}
        <button
          type="button"
          onClick={() => void markGitHubConnected()}
          disabled={loading}
          className="wizard-skip-btn"
        >
          Skip for Now
        </button>
      </div>
    </div>
  );
}
