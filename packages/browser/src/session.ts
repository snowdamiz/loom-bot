import { existsSync } from 'node:fs';
import type { BrowserContext, Page } from 'playwright';
import type { BrowserManager } from './manager.js';

/**
 * Options for opening a BrowserSession.
 */
export interface BrowserSessionOptions {
  /** BrowserManager instance managing the underlying browser lifecycle */
  manager: BrowserManager;
  /** Identity ID for this session — used for audit trail and context isolation */
  identityId: string;
  /** Optional proxy for network-level isolation (each identity should have its own proxy) */
  proxy?: {
    server: string;
    username?: string;
    password?: string;
  };
  /**
   * Path to a saved storageState JSON file (cookies + localStorage).
   * If the file exists, it will be loaded to restore a prior session.
   */
  storageStatePath?: string;
  /** Custom User-Agent string — set to match the identity's simulated browser */
  userAgent?: string;
  /** Browser viewport dimensions — defaults to 1280x720 */
  viewport?: { width: number; height: number };
  /** Browser locale — defaults to 'en-US' */
  locale?: string;
  /** IANA timezone ID — defaults to 'America/New_York' */
  timezoneId?: string;
}

/**
 * BrowserSession wraps a single Playwright BrowserContext for one identity.
 *
 * Each identity gets its own isolated BrowserContext, ensuring:
 * - Separate cookies and storage from other identities
 * - Distinct proxy route (network-level isolation)
 * - Fingerprint separation via different UA/viewport/locale/timezone
 *
 * Usage:
 *   const session = new BrowserSession({ manager, identityId, proxy });
 *   await session.open();
 *   const page = await session.newPage();
 *   // ... navigate, interact ...
 *   await session.saveState('/path/to/state.json');
 *   await session.close();
 */
export class BrowserSession {
  private readonly options: BrowserSessionOptions;
  private context: BrowserContext | null = null;

  constructor(options: BrowserSessionOptions) {
    this.options = options;
  }

  /**
   * Open the browser context. Loads storageState from file if the path exists.
   * Must be called before newPage() or saveState().
   */
  async open(): Promise<this> {
    const browser = await this.options.manager.getBrowser();

    const storageState =
      this.options.storageStatePath && existsSync(this.options.storageStatePath)
        ? this.options.storageStatePath
        : undefined;

    this.context = await browser.newContext({
      proxy: this.options.proxy,
      storageState,
      viewport: this.options.viewport ?? { width: 1280, height: 720 },
      userAgent: this.options.userAgent,
      locale: this.options.locale ?? 'en-US',
      timezoneId: this.options.timezoneId ?? 'America/New_York',
    });

    return this;
  }

  /**
   * Open a new page (tab) within this session's context.
   */
  async newPage(): Promise<Page> {
    if (!this.context) {
      throw new Error('BrowserSession not opened — call open() first');
    }
    return this.context.newPage();
  }

  /**
   * Persist cookies and localStorage to a JSON file for later restoration.
   * Returns the path the state was saved to.
   */
  async saveState(path: string): Promise<string> {
    if (!this.context) {
      throw new Error('BrowserSession not opened — call open() first');
    }
    await this.context.storageState({ path });
    return path;
  }

  /**
   * Close the browser context and release resources.
   */
  async close(): Promise<void> {
    await this.context?.close();
    this.context = null;
  }

  /**
   * Access the underlying Playwright BrowserContext for advanced use cases.
   */
  getContext(): BrowserContext | null {
    return this.context;
  }
}
