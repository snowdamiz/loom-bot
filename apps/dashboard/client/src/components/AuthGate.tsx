import React, { useState, useEffect } from 'react';
import { getToken, setToken, clearToken } from '../lib/api.js';

interface AuthGateProps {
  children: React.ReactNode;
}

/**
 * Full-page auth gate. Validates token against /api/status.
 * Token stored in sessionStorage — cleared on tab close.
 */
export function AuthGate({ children }: AuthGateProps) {
  const [token, setTokenState] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // Auto-login if token exists in sessionStorage
  useEffect(() => {
    const stored = getToken();
    if (stored) {
      validateToken(stored)
        .then((valid) => {
          if (valid) {
            setTokenState(stored);
          } else {
            clearToken();
          }
        })
        .finally(() => setChecking(false));
    } else {
      setChecking(false);
    }
  }, []);

  async function validateToken(t: string): Promise<boolean> {
    try {
      const res = await fetch('/api/status', {
        headers: { Authorization: `Bearer ${t}` },
      });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const trimmed = inputValue.trim();
    if (!trimmed) {
      setError('Token is required');
      setLoading(false);
      return;
    }

    try {
      const valid = await validateToken(trimmed);
      if (valid) {
        setToken(trimmed);
        setTokenState(trimmed);
      } else {
        setError('Invalid token');
      }
    } catch {
      setError('Connection error — is the dashboard server running?');
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <p style={styles.checking}>Connecting...</p>
        </div>
      </div>
    );
  }

  if (token) {
    return <>{children}</>;
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <img src="/logo-mark.svg" alt="Loom" style={styles.logo} />
        <h1 style={styles.title}>Loom Dashboard</h1>
        <p style={styles.subtitle}>Enter your access token to continue</p>
        <form onSubmit={(e) => void handleSubmit(e)} style={styles.form}>
          <input
            type="password"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Access token"
            style={styles.input}
            autoFocus
            autoComplete="current-password"
          />
          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? 'Connecting...' : 'Connect'}
          </button>
          {error && <p style={styles.error}>{error}</p>}
        </form>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8f9fa',
  } as React.CSSProperties,
  card: {
    backgroundColor: '#ffffff',
    border: '1px solid #e9ecef',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    padding: '40px',
    width: '100%',
    maxWidth: '360px',
    textAlign: 'center' as const,
  } as React.CSSProperties,
  logo: {
    width: '40px',
    height: '40px',
    display: 'block',
    margin: '0 auto 14px',
  } as React.CSSProperties,
  title: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#111827',
    margin: '0 0 8px 0',
  } as React.CSSProperties,
  subtitle: {
    fontSize: '14px',
    color: '#6b7280',
    margin: '0 0 24px 0',
  } as React.CSSProperties,
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  } as React.CSSProperties,
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box' as const,
    fontFamily: 'inherit',
  } as React.CSSProperties,
  button: {
    width: '100%',
    padding: '10px',
    backgroundColor: '#111827',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    fontFamily: 'inherit',
  } as React.CSSProperties,
  error: {
    fontSize: '13px',
    color: '#dc2626',
    margin: '0',
  } as React.CSSProperties,
  checking: {
    fontSize: '14px',
    color: '#6b7280',
    margin: '0',
  } as React.CSSProperties,
};
