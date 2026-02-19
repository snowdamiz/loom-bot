import React, { useState } from 'react';
import { apiFetch } from '../lib/api.js';

interface SetupStepOpenRouterProps {
  onComplete: () => void;
}

/**
 * Step 1 of 2 in the setup wizard.
 * Collects and validates the operator's OpenRouter API key.
 */
export function SetupStepOpenRouter({ onComplete }: SetupStepOpenRouterProps) {
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = apiKey.trim();
    if (!trimmed) {
      setError('API key is required');
      return;
    }

    setLoading(true);
    try {
      const response = await apiFetch('/api/setup/openrouter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: trimmed }),
      });

      if (response.ok) {
        onComplete();
      } else {
        const data = (await response.json()) as { error?: string };
        setError(data.error ?? 'Validation failed — please check your key');
      }
    } catch {
      setError('Connection error — is the dashboard server running?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 className="wizard-step-title">Connect OpenRouter</h2>
      <p className="wizard-step-subtitle">
        Your AI backbone. Enter your OpenRouter API key to give the agent access to language models.
      </p>
      <form onSubmit={(e) => void handleSubmit(e)} className="wizard-form">
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-or-..."
          className="form-input"
          autoFocus
          autoComplete="off"
          disabled={loading}
        />
        <button type="submit" disabled={loading || !apiKey.trim()} className="btn-primary">
          {loading ? 'Validating...' : 'Validate & Save'}
        </button>
        {error && <p className="wizard-error">{error}</p>}
      </form>
      <p className="wizard-link">
        <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">
          Get a key at openrouter.ai
        </a>
      </p>
    </div>
  );
}
