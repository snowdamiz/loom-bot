import { z } from 'zod';
import type { ToolDefinition } from '../types.js';
import type { ToolRegistry } from '../registry.js';

/**
 * BOOT-02: Tool discovery tool.
 *
 * Lists all tools currently registered in the ToolRegistry.
 * The agent can use this to inspect its own capabilities, identify gaps,
 * and decide which packages to install via package_install.
 *
 * Returns name, description, and inputSchema for each tool.
 */

const inputSchema = z.object({
  query: z
    .string()
    .optional()
    .describe(
      'Optional filter string. Case-insensitive match against tool name or description. ' +
        'If omitted, all registered tools are returned.',
    ),
});

type DiscoverInput = z.infer<typeof inputSchema>;

interface ToolSummary {
  name: string;
  description: string;
  inputSchema: object;
}

type DiscoverOutput = {
  tools: ToolSummary[];
  count: number;
};

/**
 * createDiscoverToolTool(registry) — returns the tool_discover ToolDefinition.
 *
 * @param registry - The ToolRegistry instance. Captured by reference so the tool
 *                   always reflects the current state of registrations (including
 *                   any tools added after startup).
 */
export function createDiscoverToolTool(
  registry: ToolRegistry,
): ToolDefinition<DiscoverInput, DiscoverOutput> {
  return {
    name: 'tool_discover',
    description:
      'List all tools currently registered in the agent. ' +
      'Use this to audit capabilities and identify missing tools. ' +
      'Optionally filter by name or description keyword. ' +
      'After identifying a gap, use package_install to add new capabilities.',
    inputSchema,
    timeoutMs: 5_000,
    maxOutputBytes: 32_768, // 32KB — tool list can be large with many tools

    async execute(input: DiscoverInput, _signal: AbortSignal): Promise<DiscoverOutput> {
      const { query } = input;

      // Get all tools from the registry
      const allTools = registry.list();

      // Get inputSchema for each tool (need the full tool definition)
      // registry.list() returns only name+description; we need the full definition for schema
      // Access the underlying registry map via registry.get()
      const toolSummaries: ToolSummary[] = allTools.map((t) => {
        const definition = registry.get(t.name);
        return {
          name: t.name,
          description: t.description,
          inputSchema: definition?.inputSchema
            ? (definition.inputSchema as { _def?: unknown })
            : {},
        };
      });

      // Apply optional filter
      const filtered = query
        ? toolSummaries.filter(
            (t) =>
              t.name.toLowerCase().includes(query.toLowerCase()) ||
              t.description.toLowerCase().includes(query.toLowerCase()),
          )
        : toolSummaries;

      return {
        tools: filtered,
        count: filtered.length,
      };
    },
  };
}
