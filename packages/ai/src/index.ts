export * from './provider.js';
export * from './openrouter.js';
export * from './config.js';
export * from './kill-switch.js';
export * from './router.js';
export * from './discord.js';
export * from './cost-monitor.js';
export * from './tool-schema.js';

// Convenience factory — wires all components together
import type { DbClient } from '@jarvis/db';
import { loadModelConfig } from './config.js';
import { KillSwitchGuard } from './kill-switch.js';
import { OpenRouterProvider } from './openrouter.js';
import { ModelRouter } from './router.js';

/**
 * Convenience factory for creating a fully-wired ModelRouter.
 * Loads model config from env vars, creates OpenRouterProvider and KillSwitchGuard.
 */
export function createRouter(db: DbClient, apiKey: string): ModelRouter {
  const provider = new OpenRouterProvider(apiKey);
  const config = loadModelConfig();
  const killSwitch = new KillSwitchGuard(db);
  return new ModelRouter(provider, config, db, killSwitch);
}
