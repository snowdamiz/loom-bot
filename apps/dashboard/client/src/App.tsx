import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import './App.css';
import { AuthGate } from './components/AuthGate.js';
import { OverviewTab } from './components/OverviewTab.js';
import { ActivityTab } from './components/ActivityTab.js';
import { getToken } from './lib/api.js';
import { useSSE } from './hooks/useSSE.js';
import type { AgentStatus, ActivityEntry } from './hooks/useSSE.js';
import type { ActivityItem } from './hooks/useActivityFeed.js';

const LIVE_ENTRIES_CAP = 50;

type Tab = 'overview' | 'activity';

function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [liveEntries, setLiveEntries] = useState<ActivityItem[]>([]);
  const token = getToken() ?? '';
  const queryClient = useQueryClient();

  // Feed SSE status updates directly into TanStack Query cache
  const handleStatus = useCallback(
    (status: AgentStatus) => {
      queryClient.setQueryData(['agent-status'], status);
    },
    [queryClient],
  );

  // Prepend new SSE activity entries to liveEntries (capped at 50)
  const handleActivity = useCallback((activity: ActivityEntry) => {
    const item: ActivityItem = {
      id: activity.id,
      type: (activity.type as ActivityItem['type']) ?? 'tool_call',
      timestamp: activity.createdAt,
      summary: activity.summary,
      details: (activity.detail as Record<string, unknown>) ?? {},
    };
    setLiveEntries((prev) => [item, ...prev].slice(0, LIVE_ENTRIES_CAP));
  }, []);

  // On SSE reconnect, clear stale live entries and refetch queries
  const handleReconnect = useCallback(() => {
    setLiveEntries([]);
    void queryClient.invalidateQueries({ queryKey: ['activity-feed'] });
    void queryClient.invalidateQueries({ queryKey: ['agent-status'] });
  }, [queryClient]);

  useSSE({ token, onStatus: handleStatus, onActivity: handleActivity, onReconnect: handleReconnect });

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
        <ActivityTab liveEntries={liveEntries} />
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
