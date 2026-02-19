import type { Browser } from 'playwright';
import { getStealthChromium } from './stealth.js';

/**
 * BrowserManager manages the Playwright browser lifecycle.
 *
 * Provides lazy browser initialization and explicit close.
 * Not a singleton — let consumers manage their own BrowserManager instance
 * so they can control lifecycle (e.g., one per agent run, or one shared instance).
 *
 * Usage:
 *   const manager = new BrowserManager();
 *   const browser = await manager.getBrowser(); // lazy launch
 *   // ... use browser ...
 *   await manager.close();
 */
export class BrowserManager {
  private browser: Browser | null = null;

  /**
   * Launch a new headless Chromium browser with stealth plugin applied.
   * Stores the browser reference for reuse.
   */
  async launch(): Promise<Browser> {
    const stealthChromium = getStealthChromium();
    this.browser = await stealthChromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });
    return this.browser;
  }

  /**
   * Returns the existing browser, launching one if not yet started.
   */
  async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      await this.launch();
    }
    return this.browser!;
  }

  /**
   * Close the browser and release the reference.
   */
  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
  }

  /**
   * Returns true if a browser instance is currently open.
   */
  isRunning(): boolean {
    return this.browser !== null;
  }
}
