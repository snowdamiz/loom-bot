/**
 * Bootstrap tool group — 2 ToolDefinitions for agent self-provisioning.
 *
 * Tools:
 *   package_install — install npm packages at runtime via pnpm add + dynamic import (BOOT-01)
 *   tool_discover   — list all registered tools from the registry (BOOT-02)
 *
 * Use createBootstrapTools(registry) to get both tools at once.
 */

export { createInstallPackageTool } from './install-package.js';
export { createDiscoverToolTool } from './discover-tool.js';

import type { ToolRegistry } from '../registry.js';
import type { ToolDefinition } from '../types.js';
import { createInstallPackageTool } from './install-package.js';
import { createDiscoverToolTool } from './discover-tool.js';

/**
 * createBootstrapTools(registry) — convenience factory returning both bootstrap ToolDefinitions.
 *
 * Returns 2 tools:
 * 1. package_install — runtime npm install via pnpm add + dynamic import (BOOT-01)
 * 2. tool_discover   — list all registered tools, optionally filtered (BOOT-02)
 *
 * The registry reference is passed to tool_discover so it always reflects the
 * current registration state (including tools added after startup).
 *
 * @param registry - The ToolRegistry instance (passed by reference)
 */
export function createBootstrapTools(registry: ToolRegistry): ToolDefinition<unknown, unknown>[] {
  return [createInstallPackageTool(), createDiscoverToolTool(registry)];
}
