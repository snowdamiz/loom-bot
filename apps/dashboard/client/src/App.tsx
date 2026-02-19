import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import './App.css';
import { AuthGate } from './components/AuthGate.js';
import { OverviewTab } from './components/OverviewTab.js';
import { getToken } from './lib/api.js';
import { useSSE } from './hooks/useSSE.js';
import type { AgentStatus, ActivityEntry } from './hooks/useSSE.js';

type Tab = 'overview' | 'activity';

function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const token = getToken() ?? '';
  const queryClient = useQueryClient();

  // Feed SSE status updates directly into TanStack Query cache
  const handleStatus = useCallback(
    (status: AgentStatus) => {
      queryClient.setQueryData(['agent-status'], status);
    },
    [queryClient],
  );

  // Feed SSE activity updates into activity cache
  const handleActivity = useCallback(
    (_activity: ActivityEntry) => {
      // Activity tab (Plan 03) will consume this
      void queryClient.invalidateQueries({ queryKey: ['agent-activity'] });
    },
    [queryClient],
  );

  useSSE({ token, onStatus: handleStatus, onActivity: handleActivity });

  return (
    <div className="dashboard">
      <nav className="tab-bar">
        <button
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`tab-btn ${activeTab === 'activity' ? 'active' : ''}`}
          onClick={() => setActiveTab('activity')}
        >
          Activity
        </button>
      </nav>

      {activeTab === 'overview' && (
        <OverviewTab onViewActivity={() => setActiveTab('activity')} />
      )}
      {activeTab === 'activity' && (
        <div className="card">
          <p className="text-muted">Activity feed — coming in Plan 03.</p>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthGate>
      <Dashboard />
    </AuthGate>
  );
}
