import type { ToolDefinition } from './types.js';

/**
 * ToolRegistry — central registry for all tool definitions.
 *
 * The registry pattern makes tools extensible for Phase 8 self-extension:
 * the agent can register new tools at runtime via unregister() + register().
 *
 * Design decisions:
 * - register() throws on duplicate names (no silent overwrites — prevents tool shadowing bugs)
 * - unregister() is provided for Phase 8 hot-swap capability
 * - list() returns only name + description (safe for LLM tool selection prompts)
 * - invoke() is NOT here — invocation goes through invokeWithLogging() which ensures logging
 */
export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  /**
   * Register a tool definition.
   * @throws {Error} if a tool with the same name is already registered
   */
  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(
        `ToolRegistry: tool "${tool.name}" is already registered. ` +
          `Call unregister("${tool.name}") first if you intend to replace it.`
      );
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Unregister a tool by name.
   * @returns true if the tool was found and removed, false if it was not registered
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Look up a tool by name.
   * @returns The ToolDefinition, or undefined if not registered
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Check whether a tool is registered.
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * List all registered tools with name + description.
   * Suitable for use in LLM tool selection prompts.
   */
  list(): Array<{ name: string; description: string }> {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
    }));
  }

  /**
   * Number of registered tools.
   */
  count(): number {
    return this.tools.size;
  }
}
