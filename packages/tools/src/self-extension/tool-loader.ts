import { readdirSync } from 'node:fs';
import path from 'node:path';
import type { ToolRegistry } from '../registry.js';

/**
 * The directory where agent-authored compiled tool files (.mjs) are stored.
 * Relative to the process working directory (monorepo root when agent runs).
 */
export const AGENT_TOOLS_DIR = path.join(process.cwd(), 'agent-tools');

/**
 * Loads all persisted agent-authored tools from the agent-tools/ directory
 * into the provided registry at startup.
 *
 * - Only loads .mjs files (compiled JS — source .ts files are for inspection only)
 * - Uses cache-busting query param to ensure fresh imports after hot-swap
 * - Calls unregister() before register() to safely hot-swap tools on re-load
 * - Errors per file are logged to stderr and added to the failed list; loading continues
 *
 * @param registry - The ToolRegistry to register loaded tools into
 * @returns Lists of loaded tool names and failed file names
 */
export async function loadPersistedTools(
  registry: ToolRegistry
): Promise<{ loaded: string[]; failed: string[] }> {
  const loaded: string[] = [];
  const failed: string[] = [];

  let files: string[];
  try {
    files = readdirSync(AGENT_TOOLS_DIR);
  } catch (err) {
    // Directory doesn't exist on first run — not an error
    return { loaded, failed };
  }

  const mjsFiles = files.filter((f) => f.endsWith('.mjs'));

  for (const file of mjsFiles) {
    const absPath = path.join(AGENT_TOOLS_DIR, file);
    try {
      // Cache-busting to ensure re-imports pick up the latest version
      const mod = await import(`file://${absPath}?v=${Date.now()}`);
      const tool = mod.default ?? mod.tool;

      if (!tool || typeof tool.name !== 'string' || !tool.name) {
        process.stderr.write(`[tool-loader] Skipping ${file}: no valid tool definition (missing name)\n`);
        failed.push(file);
        continue;
      }

      // Unregister first to allow safe hot-swap on restart
      registry.unregister(tool.name);
      registry.register(tool);
      loaded.push(tool.name);
    } catch (err) {
      process.stderr.write(`[tool-loader] Failed to load ${file}: ${err}\n`);
      failed.push(file);
    }
  }

  return { loaded, failed };
}
