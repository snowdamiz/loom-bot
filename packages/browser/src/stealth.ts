import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

/**
 * Guard flag to prevent double-plugin registration.
 * playwright-extra throws if chromium.use() is called twice with the same plugin.
 */
let stealthRegistered = false;

/**
 * Returns a playwright-extra chromium instance with the stealth plugin applied.
 * Safe to call multiple times — stealth plugin is only registered once.
 *
 * Usage:
 *   const stealthChromium = getStealthChromium();
 *   const browser = await stealthChromium.launch({ headless: true });
 */
export function getStealthChromium(): typeof chromium {
  if (!stealthRegistered) {
    chromium.use(StealthPlugin());
    stealthRegistered = true;
  }
  return chromium;
}
