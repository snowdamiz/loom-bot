/**
 * Browser tool group — 8 ToolDefinitions for browser automation.
 *
 * Tools:
 *   Session lifecycle: browser_session_open, browser_session_close, browser_session_save
 *   Navigation:        browser_navigate
 *   Interaction:       browser_click, browser_fill, browser_extract
 *   Capture:           browser_screenshot
 *
 * All tools operate on the shared activeSessions map via sessionId.
 * Use createBrowserTools(browserManager) to get all 8 tools at once.
 */

// State exports
export { activeSessions, getSession, generateSessionId } from './_state.js';

// Individual tool factories
export { createBrowserNavigateTool } from './navigate.js';
export {
  createBrowserClickTool,
  createBrowserFillTool,
  createBrowserExtractTool,
} from './interact.js';
export { createBrowserScreenshotTool } from './screenshot.js';
export {
  createBrowserSessionOpenTool,
  createBrowserSessionCloseTool,
  createBrowserSessionSaveTool,
} from './session-manage.js';

import type { BrowserManager } from '@jarvis/browser';
import type { ToolDefinition } from '../types.js';
import { createBrowserNavigateTool } from './navigate.js';
import {
  createBrowserClickTool,
  createBrowserFillTool,
  createBrowserExtractTool,
} from './interact.js';
import { createBrowserScreenshotTool } from './screenshot.js';
import {
  createBrowserSessionOpenTool,
  createBrowserSessionCloseTool,
  createBrowserSessionSaveTool,
} from './session-manage.js';

/**
 * createBrowserTools(browserManager) — convenience factory returning all 8 browser ToolDefinitions.
 *
 * Registered tools:
 * 1. browser_session_open   — open an isolated BrowserContext per identity
 * 2. browser_session_close  — close and free session resources
 * 3. browser_session_save   — persist cookies/localStorage to JSON for later restoration
 * 4. browser_navigate       — navigate to a URL (with configurable waitUntil)
 * 5. browser_click          — click elements (with optional human-like mouse path)
 * 6. browser_fill           — fill form fields (with optional keystroke timing simulation)
 * 7. browser_extract        — extract text/attributes from page elements
 * 8. browser_screenshot     — capture page as base64 PNG
 *
 * @param browserManager - BrowserManager instance managing the underlying browser lifecycle
 */
export function createBrowserTools(browserManager: BrowserManager): ToolDefinition<unknown, unknown>[] {
  return [
    createBrowserSessionOpenTool(browserManager),
    createBrowserSessionCloseTool(),
    createBrowserSessionSaveTool(),
    createBrowserNavigateTool(),
    createBrowserClickTool(),
    createBrowserFillTool(),
    createBrowserExtractTool(),
    createBrowserScreenshotTool(),
  ];
}
