import { randomBytes } from 'node:crypto';
import type { BrowserSession } from '@jarvis/browser';
import type { Page } from 'playwright';

/**
 * Represents an active browser session with its associated page.
 */
export interface ActiveSession {
  session: BrowserSession;
  page: Page;
  identityId: string;
}

/**
 * Module-level map tracking all open browser sessions by sessionId.
 * Session tools control the lifecycle (open/close/save).
 * Navigation and interaction tools operate on sessions in this map.
 */
export const activeSessions = new Map<string, ActiveSession>();

/**
 * Retrieve an active session by ID, throwing a descriptive error if not found.
 * Used by navigation/interaction tools to access the session.
 */
export function getSession(sessionId: string): ActiveSession {
  const s = activeSessions.get(sessionId);
  if (!s) {
    throw new Error(
      `No active browser session with id '${sessionId}'. Call browser_session_open first.`,
    );
  }
  return s;
}

/**
 * Generate a random 8-character hex session ID.
 */
export function generateSessionId(): string {
  return randomBytes(4).toString('hex');
}
