import { z } from 'zod';
import type { ToolDefinition } from '../types.js';
import { getSession } from './_state.js';

/** Maximum base64 size of screenshot data returned to LLM (~375KB raw = 500KB base64) */
const MAX_SCREENSHOT_BYTES = 500_000;

/**
 * browser_screenshot — capture a screenshot of the current page or a specific element.
 *
 * Returns the screenshot as a base64-encoded PNG string.
 * Truncates to 500KB of base64 to prevent LLM context overflow.
 */
export function createBrowserScreenshotTool(): ToolDefinition {
  return {
    name: 'browser_screenshot',
    description:
      'Take a screenshot of the current browser page or a specific element. ' +
      'Returns base64-encoded PNG. Set fullPage=true to capture the entire scrollable page. ' +
      'Set selector to capture only a specific element. ' +
      'Output is capped at 500KB of base64 to protect LLM context.',
    inputSchema: z.object({
      sessionId: z.string().min(1, 'sessionId is required'),
      fullPage: z.boolean().optional().default(false),
      selector: z.string().optional(),
    }),
    timeoutMs: 30_000,
    execute: async (input, _signal) => {
      const { sessionId, fullPage, selector } = input as {
        sessionId: string;
        fullPage: boolean;
        selector?: string;
      };
      try {
        const { page } = getSession(sessionId);

        let buffer: Buffer;
        if (selector) {
          buffer = await page.locator(selector).screenshot({ type: 'png' });
        } else {
          buffer = await page.screenshot({ fullPage, type: 'png' });
        }

        const base64 = buffer.toString('base64');

        if (base64.length > MAX_SCREENSHOT_BYTES) {
          return {
            screenshot: base64.slice(0, MAX_SCREENSHOT_BYTES),
            format: 'png',
            truncated: true,
            warning: `Screenshot truncated from ${base64.length} to ${MAX_SCREENSHOT_BYTES} bytes of base64.`,
          };
        }

        return {
          screenshot: base64,
          format: 'png',
          truncated: false,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { error: message };
      }
    },
  };
}
