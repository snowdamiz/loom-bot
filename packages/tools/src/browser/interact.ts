import { z } from 'zod';
import type { ToolDefinition } from '../types.js';
import { getSession } from './_state.js';

/**
 * Returns a random integer in [min, max] (inclusive).
 */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * browser_click — click a page element by CSS selector.
 *
 * When humanLike=true, simulates a human-like mouse path:
 * 1. Finds element bounding box
 * 2. Picks a random point within the box (offset ±30% from center)
 * 3. Moves mouse with intermediate steps (simulating human path)
 * 4. Adds a random pre-click delay
 * 5. Clicks via mouse.click() instead of page.click()
 *
 * Per locked stealth decision: human-like timing/mouse movements exposed to agent.
 */
export function createBrowserClickTool(): ToolDefinition {
  return {
    name: 'browser_click',
    description:
      'Click a page element identified by a CSS selector in an active browser session. ' +
      'Set humanLike=true to simulate human mouse movement (random path, pre-click delay) ' +
      'for better anti-bot evasion. Returns { clicked: true } on success.',
    inputSchema: z.object({
      sessionId: z.string().min(1, 'sessionId is required'),
      selector: z.string().min(1, 'selector is required'),
      timeout: z.number().int().positive().optional().default(5000),
      humanLike: z.boolean().optional().default(false),
    }),
    timeoutMs: 15_000,
    execute: async (input, _signal) => {
      const { sessionId, selector, timeout, humanLike } = input as {
        sessionId: string;
        selector: string;
        timeout: number;
        humanLike: boolean;
      };
      try {
        const { page } = getSession(sessionId);

        if (humanLike) {
          // Get element bounding box for human-like mouse positioning
          const box = await page.locator(selector).boundingBox();
          if (!box) {
            return { clicked: false, error: 'Element not found or not visible' };
          }

          // Calculate random point within the bounding box (±30% offset from center)
          const offsetX = (Math.random() - 0.5) * 0.6 * box.width;
          const offsetY = (Math.random() - 0.5) * 0.6 * box.height;
          const x = box.x + box.width / 2 + offsetX;
          const y = box.y + box.height / 2 + offsetY;

          // Move mouse with intermediate steps to simulate human path
          await page.mouse.move(x, y, { steps: randomInt(5, 15) });

          // Random pre-click delay (50–200ms)
          await new Promise<void>((r) => setTimeout(r, randomInt(50, 200)));

          // Click at the computed position
          await page.mouse.click(x, y);
        } else {
          await page.click(selector, { timeout });
        }

        return { clicked: true, selector };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('not found') || message.includes('timeout') || message.includes('waiting')) {
          return { clicked: false, error: 'Element not found' };
        }
        return { clicked: false, error: message };
      }
    },
  };
}

/**
 * browser_fill — fill a form field by CSS selector.
 *
 * When typeDelay > 0, simulates human keystroke timing via page.type():
 * 1. Clicks the field to focus it
 * 2. Clears existing content
 * 3. Types with the specified delay between keystrokes
 *
 * This fires individual keydown/keypress/keyup events per character,
 * unlike page.fill() which sets the value instantaneously.
 *
 * Per locked stealth decision: typeDelay exposes human-like typing to the agent.
 */
export function createBrowserFillTool(): ToolDefinition {
  return {
    name: 'browser_fill',
    description:
      'Fill a form field identified by a CSS selector in an active browser session. ' +
      'Set typeDelay (ms between keystrokes, e.g. 50-150) to simulate human typing speed ' +
      'for better anti-bot evasion. Without typeDelay, fills instantly. ' +
      'Returns { filled: true } on success.',
    inputSchema: z.object({
      sessionId: z.string().min(1, 'sessionId is required'),
      selector: z.string().min(1, 'selector is required'),
      value: z.string(),
      timeout: z.number().int().positive().optional().default(5000),
      typeDelay: z.number().int().min(0).optional(),
    }),
    timeoutMs: 60_000,
    execute: async (input, _signal) => {
      const { sessionId, selector, value, timeout, typeDelay } = input as {
        sessionId: string;
        selector: string;
        value: string;
        timeout: number;
        typeDelay?: number;
      };
      try {
        const { page } = getSession(sessionId);

        if (typeDelay && typeDelay > 0) {
          // Human-like typing: focus, clear, then type with per-keystroke delay
          await page.click(selector, { timeout });
          await page.locator(selector).fill('');
          await page.type(selector, value, { delay: typeDelay });
        } else {
          // Programmatic fill (instantaneous, no keystroke events)
          await page.fill(selector, value, { timeout });
        }

        return { filled: true, selector };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('not found') || message.includes('timeout') || message.includes('waiting')) {
          return { filled: false, error: 'Element not found' };
        }
        return { filled: false, error: message };
      }
    },
  };
}

/**
 * browser_extract — extract text or attribute values from page elements.
 *
 * Supports:
 * - Single element: returns first match's textContent (or attribute value)
 * - Multiple elements: returns all matching elements' text content
 * - Attribute extraction: returns the specified attribute value instead of text
 *
 * Content is truncated to 10,000 chars to prevent LLM context overflow.
 */
export function createBrowserExtractTool(): ToolDefinition {
  return {
    name: 'browser_extract',
    description:
      'Extract text content or attribute values from page elements by CSS selector. ' +
      'Use multiple=true to get all matching elements. ' +
      'Use attribute to extract a specific HTML attribute instead of text. ' +
      'Content is truncated at 10,000 characters to protect LLM context.',
    inputSchema: z.object({
      sessionId: z.string().min(1, 'sessionId is required'),
      selector: z.string().min(1, 'selector is required'),
      attribute: z.string().optional(),
      multiple: z.boolean().optional().default(false),
    }),
    timeoutMs: 15_000,
    execute: async (input, _signal) => {
      const { sessionId, selector, attribute, multiple } = input as {
        sessionId: string;
        selector: string;
        attribute?: string;
        multiple: boolean;
      };
      try {
        const { page } = getSession(sessionId);
        const MAX_CHARS = 10_000;

        if (multiple) {
          let contents: string[];
          if (attribute) {
            // Get specified attribute from all matching elements
            contents = await page.locator(selector).evaluateAll(
              (els, attr) =>
                els.map((el) => (el as Element).getAttribute(attr) ?? ''),
              attribute,
            );
          } else {
            contents = await page.locator(selector).allTextContents();
          }
          // Truncate each item and the total
          const truncated = contents.map((c) => c.slice(0, MAX_CHARS));
          return { content: truncated };
        } else {
          let content: string | null;
          if (attribute) {
            content = await page.locator(selector).first().getAttribute(attribute);
          } else {
            content = await page.locator(selector).first().textContent();
          }
          const result = (content ?? '').slice(0, MAX_CHARS);
          return { content: result };
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { error: message };
      }
    },
  };
}
