import { z } from 'zod';
import type { ToolDefinition } from '../types.js';
import { getSession } from './_state.js';

/**
 * browser_navigate — navigate to a URL in an active browser session.
 *
 * Returns the final URL, page title, and HTTP status code.
 * Errors are returned as { error: string } rather than thrown (ToolDefinition pattern).
 */
export function createBrowserNavigateTool(): ToolDefinition {
  return {
    name: 'browser_navigate',
    description:
      'Navigate to a URL in an active browser session. ' +
      'Returns the final URL (after redirects), page title, and HTTP response status. ' +
      'Requires an active session from browser_session_open.',
    inputSchema: z.object({
      sessionId: z.string().min(1, 'sessionId is required'),
      url: z.string().url('url must be a valid URL'),
      waitUntil: z
        .enum(['load', 'domcontentloaded', 'networkidle'])
        .optional()
        .default('load'),
    }),
    timeoutMs: 35_000,
    execute: async (input, _signal) => {
      const { sessionId, url, waitUntil } = input as {
        sessionId: string;
        url: string;
        waitUntil: 'load' | 'domcontentloaded' | 'networkidle';
      };
      try {
        const { page } = getSession(sessionId);
        const response = await page.goto(url, {
          waitUntil,
          timeout: 30_000,
        });
        return {
          url: page.url(),
          title: await page.title(),
          status: response?.status() ?? null,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { error: message };
      }
    },
  };
}
