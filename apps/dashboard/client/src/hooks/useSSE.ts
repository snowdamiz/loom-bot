import { useEffect } from 'react';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import type { SelfExtensionStatus } from './useSelfExtensionStatus.js';

export interface AgentStatus {
  isHalted: boolean;
  haltReason: string | null;
  activatedAt: string | null;
  systemStatus: string;
  activeGoals: Array<{ id: number; description: string; priority: string }>;
  uptime: number | null;
}

export interface ActivityEntry {
  id: number;
  type: string;
  summary: string;
  detail: unknown;
  createdAt: string;
}

interface UseSSEOptions {
  token: string;
  onStatus: (status: AgentStatus) => void;
  onActivity: (activity: ActivityEntry) => void;
  onSelfExtension?: (status: SelfExtensionStatus) => void;
  /** Called when SSE reconnects after a disconnect — use to clear stale live entries */
  onReconnect?: () => void;
}

/**
 * SSE hook using @microsoft/fetch-event-source for auth header support.
 * Native EventSource cannot send Authorization headers.
 */
export function useSSE({
  token,
  onStatus,
  onActivity,
  onSelfExtension,
  onReconnect,
}: UseSSEOptions): void {
  useEffect(() => {
    const controller = new AbortController();
    let connected = false;

    fetchEventSource('/api/sse', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
      onopen: async (response) => {
        if (response.ok) {
          if (connected && onReconnect) {
            // This is a reconnect (was connected before, now re-established)
            onReconnect();
          }
          connected = true;
        }
      },
      onmessage(ev) {
        if (!ev.data || ev.event === 'heartbeat') return;
        try {
          const data: unknown = JSON.parse(ev.data);
          if (ev.event === 'status') {
            onStatus(data as AgentStatus);
          } else if (ev.event === 'activity') {
            onActivity(data as ActivityEntry);
          } else if (ev.event === 'self_extension') {
            onSelfExtension?.(data as SelfExtensionStatus);
          }
        } catch {
          // Ignore malformed messages
        }
      },
      onerror(err) {
        // On 401, stop reconnecting
        if (err instanceof Error && err.message.includes('401')) {
          throw err;
        }
        // For other errors, let fetchEventSource handle automatic reconnect
        // onReconnect will be called in onopen when the reconnection succeeds
      },
    }).catch(() => {
      // Swallow error on abort or token clear
    });

    return () => {
      controller.abort();
    };
  }, [token, onStatus, onActivity, onSelfExtension, onReconnect]);
}
