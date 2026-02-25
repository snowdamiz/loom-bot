import { useState, useCallback } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthGate } from './components/AuthGate.js';
import { SetupWizard } from './components/SetupWizard.js';
import { DashboardLayout } from './components/DashboardLayout.js';
import { OverviewTab } from './components/OverviewTab.js';
import { ActivityTab } from './components/ActivityTab.js';
import { useSetupState } from './hooks/useSetupState.js';
import { useSSE } from './hooks/useSSE.js';
import { getToken } from './lib/api.js';
import type { AgentStatus } from './hooks/useSSE.js';
import type { ActivityItem } from './hooks/useActivityFeed.js';

const queryClient = new QueryClient();

type Tab = 'overview' | 'activity';

function Dashboard() {
  const {
    data: setupState,
    isLoading: setupLoading,
    isError: setupError,
    error: setupErrorValue,
    refetch: refetchSetupState,
  } = useSetupState();
  const [setupComplete, setSetupComplete] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [liveEntries, setLiveEntries] = useState<ActivityItem[]>([]);

  const token = getToken() ?? '';

  const handleStatus = useCallback(
    (status: AgentStatus) => {
      queryClient.setQueryData(['agent-status'], status);
    },
    [],
  );

  const handleActivity = useCallback(
    (entry: { id: number; type: string; summary: string; detail: unknown; createdAt: string }) => {
      const item: ActivityItem = {
        id: entry.id,
        type: entry.type as ActivityItem['type'],
        timestamp: entry.createdAt,
        summary: entry.summary,
        details: (entry.detail as Record<string, unknown>) ?? {},
      };
      setLiveEntries((prev) => [item, ...prev]);
    },
    [],
  );

  const handleReconnect = useCallback(() => {
    setLiveEntries([]);
  }, []);

  useSSE({
    token,
    onStatus: handleStatus,
    onActivity: handleActivity,
    onReconnect: handleReconnect,
  });

  if (setupLoading) {
    return (
      <div className="loading-page">
        <p className="loading-text">Loading...</p>
      </div>
    );
  }

  if (setupError) {
    return (
      <div className="loading-page">
        <p className="loading-text" style={{ color: '#ef4444' }}>
          {setupErrorValue instanceof Error ? setupErrorValue.message : 'Failed to load setup state'}
        </p>
        <button className="btn btn-ghost" onClick={() => void refetchSetupState()}>
          Retry
        </button>
      </div>
    );
  }

  if (setupState && !setupState.complete && !setupComplete) {
    return (
      <SetupWizard
        setupState={setupState}
        onRefreshSetupState={async () => {
          await refetchSetupState();
        }}
        onSetupComplete={() => setSetupComplete(true)}
      />
    );
  }

  return (
    <DashboardLayout>
      <div className="dashboard">
        <div className="dashboard-header">
          <img src="/logo-primary.svg" alt="Loom" className="dashboard-logo" />
        </div>
        <div className="tab-bar">
          <button
            className={`tab-btn ${tab === 'overview' ? 'active' : ''}`}
            onClick={() => setTab('overview')}
          >
            Overview
          </button>
          <button
            className={`tab-btn ${tab === 'activity' ? 'active' : ''}`}
            onClick={() => setTab('activity')}
          >
            Activity
          </button>
        </div>

        {tab === 'overview' && (
          <OverviewTab onViewActivity={() => setTab('activity')} />
        )}
        {tab === 'activity' && (
          <ActivityTab liveEntries={liveEntries} />
        )}
      </div>
    </DashboardLayout>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <Dashboard />
      </AuthGate>
    </QueryClientProvider>
  );
}
