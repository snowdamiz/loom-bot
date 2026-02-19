// Redis client and graceful shutdown
export { redis, shutdownRedis } from './redis.js';

// Session memory helpers (DATA-04)
export { setSession, getSession, deleteSession, listSessionKeys } from './session.js';

// Core tool infrastructure (Plan 03)
export type { ToolDefinition, ToolResult } from './types.js';
export { ToolRegistry } from './registry.js';
export { withTimeout, ToolTimeoutError } from './timeout.js';
export { invokeWithLogging } from './invoke.js';
export { invokeWithKillCheck } from './invoke-safe.js';

// Tool implementations (Plan 03)
export { shellTool } from './shell/index.js';
export { httpTool } from './http/index.js';
export { fileTool } from './file/index.js';
export { createDbTool, dbTool } from './db-tool/index.js';

// Browser tools (Phase 06)
export { createBrowserTools } from './browser/index.js';

// Identity tools (Phase 06)
export { createIdentityTools } from './identity/index.js';

// Bootstrap tools (Phase 06)
export { createBootstrapTools } from './bootstrap/index.js';

// Self-extension tools (Phase 08)
export { createSelfExtensionTools } from './self-extension/index.js';
export { loadPersistedTools, AGENT_TOOLS_DIR } from './self-extension/index.js';

// Convenience factory: create a registry with all 4 default tools pre-registered.
// This is what apps/agent will call at startup.
import type { DbClient } from '@jarvis/db';
import { ToolRegistry } from './registry.js';
import { shellTool } from './shell/index.js';
import { httpTool } from './http/index.js';
import { fileTool } from './file/index.js';
import { createDbTool } from './db-tool/index.js';

/**
 * createDefaultRegistry(db) — factory returning a ToolRegistry with all 4 tools registered.
 *
 * Registered tools:
 * - shell: command execution (TOOL-01)
 * - http: HTTP requests with cookie jar (TOOL-02)
 * - file: filesystem read/write/delete (TOOL-03)
 * - db: arbitrary SQL queries including DDL (TOOL-04)
 *
 * @param db - DbClient instance for the db tool (same pool as @jarvis/db — no extra connections)
 */
export function createDefaultRegistry(db: DbClient): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(shellTool);
  registry.register(httpTool);
  registry.register(fileTool);
  registry.register(createDbTool(db));
  return registry;
}
