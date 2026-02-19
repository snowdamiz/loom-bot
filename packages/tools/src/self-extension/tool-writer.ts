import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { compileTypeScript } from './compiler.js';
import { runInSandbox } from './sandbox-runner.js';
import { AGENT_TOOLS_DIR } from './tool-loader.js';
import { stageBuiltinChange } from './staging-deployer.js';
import type { ToolRegistry } from '../registry.js';
import type { ToolDefinition } from '../types.js';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const toolWriteInput = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/)
    .describe(
      'Tool name (lowercase, underscores). Must be unique. If updating an existing agent-authored tool, use the same name.'
    ),
  description: z
    .string()
    .min(1)
    .max(500)
    .describe('What this tool does — shown to the LLM for tool selection.'),
  tsSource: z
    .string()
    .min(1)
    .describe(
      'Complete TypeScript source code for the tool. Must export a ToolDefinition as default export or named "tool" export. ' +
        'The tool must have: name, description, inputSchema (zod), timeoutMs, execute(input, signal). ' +
        'Can import any installed npm package. Example: import { z } from "zod"; import type { ToolDefinition } from "@jarvis/tools";'
    ),
  testInput: z
    .unknown()
    .default({})
    .describe(
      'Test input to pass to the tool execute() during sandbox testing. Must match the tool inputSchema.'
    ),
  builtinModify: z
    .boolean()
    .default(false)
    .describe(
      'Set to true to modify a built-in tool (Phase 1-7). This will use git branch staging: ' +
        'branch, test, merge on success. Only use this if you need to modify core agent capabilities. ' +
        'For new tools, leave false.'
    ),
  builtinFilePath: z
    .string()
    .optional()
    .describe(
      'Required when builtinModify is true. The file path of the built-in tool source to modify, ' +
        'relative to project root. Example: "packages/tools/src/shell/index.ts"'
    ),
});

type ToolWriteInput = z.infer<typeof toolWriteInput>;

const toolDeleteInput = z.object({
  name: z.string().min(1).describe('Name of the agent-authored tool to delete.'),
});

type ToolDeleteInput = z.infer<typeof toolDeleteInput>;

// ---------------------------------------------------------------------------
// createToolWriteTool
// ---------------------------------------------------------------------------

/**
 * Creates the tool_write ToolDefinition.
 *
 * The factory captures the initial tool names from the registry at creation time.
 * These are the "built-in" tools. Agent-authored tools are anything NOT in this set.
 *
 * @param registry - The live ToolRegistry (by reference) for hot-swap registration
 * @param onToolChange - Optional callback invoked after a tool is written/updated (fire-and-forget)
 */
export function createToolWriteTool(registry: ToolRegistry, onToolChange?: () => void): ToolDefinition {
  // Capture built-in tool names at factory creation time
  const builtinToolNames = new Set<string>(registry.list().map((t) => t.name));

  return {
    name: 'tool_write',
    description:
      'Write a new TypeScript tool or update an existing one. The source code is compiled, tested in an isolated sandbox process, then persisted to disk and registered for immediate use. ' +
      'For new tools: provide name, description, and tsSource. The tool is compiled via esbuild, tested in a forked child process, and on success written to disk and registered in the tool registry. ' +
      'For updating agent-authored tools: use the same name — the old version is replaced. ' +
      'For modifying built-in tools (Phase 1-7): set builtinModify=true and provide builtinFilePath. This creates a git branch, applies the change, tests it in a sandbox, and merges only on success. ' +
      'IMPORTANT: Your tool must export a ToolDefinition as default export or named "tool" export. ' +
      'All tool names must be lowercase with underscores. If your tool name matches a built-in, you must use builtinModify=true.',
    inputSchema: toolWriteInput,
    timeoutMs: 120_000,
    maxOutputBytes: 8192,

    async execute(input: ToolWriteInput, signal: AbortSignal) {
      try {
        // Check for abort
        if (signal.aborted) {
          return { success: false, error: 'Operation aborted.' };
        }

        // Validate tool name collision with built-ins
        if (builtinToolNames.has(input.name) && !input.builtinModify) {
          return {
            success: false,
            error: `Tool name "${input.name}" conflicts with a built-in tool. Use builtinModify=true to modify built-in tools, or choose a different name (e.g., "agent_${input.name}").`,
          };
        }

        // ----------------------------------------------------------------
        // Built-in modification path — git branch staging
        // ----------------------------------------------------------------
        if (input.builtinModify) {
          if (!input.builtinFilePath) {
            return {
              success: false,
              error:
                'builtinFilePath is required when builtinModify is true. Provide the file path relative to the project root.',
            };
          }

          const result = await stageBuiltinChange({
            toolName: input.name,
            filePath: input.builtinFilePath,
            newContent: input.tsSource,
            testInput: input.testInput,
          });

          if (result.success) {
            return {
              success: true,
              mode: 'builtin-staged',
              toolName: input.name,
              message:
                'Built-in tool modified via git branch staging. Run pnpm build --filter @jarvis/tools to compile changes.',
            };
          } else {
            return { success: false, error: result.error };
          }
        }

        // ----------------------------------------------------------------
        // Agent-authored tool path
        // ----------------------------------------------------------------

        // Step 1: Compile
        let code: string;
        let warnings: string[];
        try {
          const compiled = await compileTypeScript(input.tsSource);
          code = compiled.code;
          warnings = compiled.warnings;
        } catch (err) {
          return {
            success: false,
            error: 'Compilation failed: ' + (err instanceof Error ? err.message : String(err)),
          };
        }

        // Step 2: Sandbox test
        const sandboxResult = await runInSandbox(code, input.name, input.testInput, 60_000);
        if (!sandboxResult.passed) {
          return {
            success: false,
            error: 'Sandbox test failed: ' + sandboxResult.error,
            sandboxOutput: sandboxResult.output,
          };
        }

        // Step 3: Persist to disk
        mkdirSync(AGENT_TOOLS_DIR, { recursive: true });
        writeFileSync(path.join(AGENT_TOOLS_DIR, `${input.name}.ts`), input.tsSource, 'utf-8');
        writeFileSync(path.join(AGENT_TOOLS_DIR, `${input.name}.mjs`), code, 'utf-8');

        // Step 4: Dynamic import and register
        const absPath = path.resolve(AGENT_TOOLS_DIR, `${input.name}.mjs`);
        let mod: Record<string, unknown>;
        try {
          mod = (await import(`file://${absPath}?v=${Date.now()}`)) as Record<string, unknown>;
        } catch (err) {
          // Clean up disk files if import fails
          try { unlinkSync(path.join(AGENT_TOOLS_DIR, `${input.name}.ts`)); } catch { /* ignore */ }
          try { unlinkSync(path.join(AGENT_TOOLS_DIR, `${input.name}.mjs`)); } catch { /* ignore */ }
          return {
            success: false,
            error: 'Failed to import compiled module: ' + (err instanceof Error ? err.message : String(err)),
          };
        }

        const tool = (mod.default ?? mod.tool) as ToolDefinition | undefined;

        if (!tool || typeof tool.name !== 'string' || !tool.name) {
          // Clean up disk files
          try { unlinkSync(path.join(AGENT_TOOLS_DIR, `${input.name}.ts`)); } catch { /* ignore */ }
          try { unlinkSync(path.join(AGENT_TOOLS_DIR, `${input.name}.mjs`)); } catch { /* ignore */ }
          return {
            success: false,
            error:
              'Compiled code does not export a ToolDefinition (expected default or named "tool" export)',
          };
        }

        if (tool.name !== input.name) {
          // Clean up disk files
          try { unlinkSync(path.join(AGENT_TOOLS_DIR, `${input.name}.ts`)); } catch { /* ignore */ }
          try { unlinkSync(path.join(AGENT_TOOLS_DIR, `${input.name}.mjs`)); } catch { /* ignore */ }
          return {
            success: false,
            error: `Tool name mismatch: input.name is "${input.name}" but tool.name is "${tool.name}". They must match.`,
          };
        }

        // Unregister old version (no-op if not registered), then register new version
        registry.unregister(input.name);
        registry.register(tool);

        // Notify worker to reload tools (fire-and-forget)
        onToolChange?.();

        // Step 5: Return success
        return {
          success: true,
          mode: 'agent-authored',
          toolName: input.name,
          warnings,
          testOutput: sandboxResult.output,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}

// ---------------------------------------------------------------------------
// createToolDeleteTool
// ---------------------------------------------------------------------------

/**
 * Creates the tool_delete ToolDefinition.
 *
 * The factory captures built-in tool names at creation time. Built-in tools
 * cannot be deleted — use tool_write with builtinModify=true to modify them.
 *
 * @param registry - The live ToolRegistry (by reference) for unregistration
 * @param onToolChange - Optional callback invoked after a tool is deleted (fire-and-forget)
 */
export function createToolDeleteTool(registry: ToolRegistry, onToolChange?: () => void): ToolDefinition {
  // Capture built-in tool names at factory creation time
  const builtinToolNames = new Set<string>(registry.list().map((t) => t.name));

  return {
    name: 'tool_delete',
    description:
      'Delete an agent-authored tool. Unregisters it from the tool registry and removes its source files from disk. ' +
      'Cannot delete built-in tools (Phase 1-7). The tool will no longer be available in subsequent planning cycles.',
    inputSchema: toolDeleteInput,
    timeoutMs: 10_000,

    async execute(input: ToolDeleteInput, signal: AbortSignal) {
      try {
        if (signal.aborted) {
          return { success: false, error: 'Operation aborted.' };
        }

        // Block deletion of built-in tools
        if (builtinToolNames.has(input.name)) {
          return {
            success: false,
            error:
              'Cannot delete built-in tool. Use tool_write with builtinModify=true to modify built-in tools.',
          };
        }

        // Unregister from registry
        const wasRegistered = registry.unregister(input.name);
        if (!wasRegistered) {
          process.stderr.write(
            `[tool_delete] Warning: tool "${input.name}" was not registered in the registry (may already be unregistered)\n`
          );
        }

        // Remove disk files (best-effort — don't fail if files are missing)
        try {
          unlinkSync(path.join(AGENT_TOOLS_DIR, `${input.name}.ts`));
        } catch {
          // File may not exist
        }
        try {
          unlinkSync(path.join(AGENT_TOOLS_DIR, `${input.name}.mjs`));
        } catch {
          // File may not exist
        }

        // Notify worker to reload tools (fire-and-forget)
        onToolChange?.();

        return { success: true, deleted: input.name };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}
