import { z } from 'zod';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';

/**
 * Duck-typed registry interface accepted by toolDefinitionsToOpenAI.
 * Using a structural type (not ToolRegistry directly) keeps @jarvis/ai independent
 * from @jarvis/tools — the dep direction is ai -> tools, but we avoid it here.
 */
interface ToolRegistryLike {
  list(): Array<{ name: string; description: string }>;
  get(name: string): { inputSchema: unknown } | undefined;
}

/**
 * Convert a Zod type to a JSON Schema object compatible with OpenAI tool definitions.
 *
 * Handles the Zod types used in the current tool registry:
 * - ZodObject     → { type: 'object', properties: {...}, required: [...] }
 * - ZodString     → { type: 'string' }
 * - ZodNumber     → { type: 'number' }
 * - ZodBoolean    → { type: 'boolean' }
 * - ZodEnum       → { type: 'string', enum: [...] }
 * - ZodArray      → { type: 'array', items: {...} }
 * - ZodRecord     → { type: 'object', additionalProperties: {...} }
 * - ZodOptional   → unwrap inner type
 * - ZodDefault    → unwrap inner type
 * - ZodUnknown    → {} (any)
 * - ZodLiteral    → { type: string/number/boolean, const: value }
 *
 * Does NOT require zod-to-json-schema package — avoids new dependencies.
 */
export function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  // Unwrap optional/default/nullable wrappers
  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema.unwrap());
  }
  if (schema instanceof z.ZodDefault) {
    return zodToJsonSchema(schema._def.innerType as z.ZodType);
  }
  if (schema instanceof z.ZodNullable) {
    const inner = zodToJsonSchema(schema.unwrap());
    return { ...inner, nullable: true };
  }

  // Primitive types
  if (schema instanceof z.ZodString) {
    const result: Record<string, unknown> = { type: 'string' };
    // Collect string validations
    for (const check of schema._def.checks ?? []) {
      if (check.kind === 'min') result.minLength = check.value;
      if (check.kind === 'max') result.maxLength = check.value;
    }
    return result;
  }

  if (schema instanceof z.ZodNumber) {
    const result: Record<string, unknown> = { type: 'number' };
    for (const check of schema._def.checks ?? []) {
      if (check.kind === 'int') result.type = 'integer';
      if (check.kind === 'min') result.minimum = check.value;
      if (check.kind === 'max') result.maximum = check.value;
    }
    return result;
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean' };
  }

  if (schema instanceof z.ZodLiteral) {
    const val = schema._def.value;
    const type = typeof val;
    return { type, const: val };
  }

  // Enum
  if (schema instanceof z.ZodEnum) {
    return { type: 'string', enum: schema._def.values };
  }

  // Array
  if (schema instanceof z.ZodArray) {
    return {
      type: 'array',
      items: zodToJsonSchema(schema._def.type as z.ZodType),
    };
  }

  // Record (z.record)
  if (schema instanceof z.ZodRecord) {
    return {
      type: 'object',
      additionalProperties: zodToJsonSchema(schema._def.valueType as z.ZodType),
    };
  }

  // Object
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodType>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, fieldSchema] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(fieldSchema as z.ZodType);

      // A field is required if it is NOT ZodOptional and NOT ZodDefault
      const raw = fieldSchema as z.ZodType;
      const isOptional = raw instanceof z.ZodOptional;
      const isDefault = raw instanceof z.ZodDefault;
      if (!isOptional && !isDefault) {
        required.push(key);
      }
    }

    const result: Record<string, unknown> = { type: 'object', properties };
    if (required.length > 0) {
      result.required = required;
    }
    return result;
  }

  // Unknown / any — pass through as empty schema
  if (schema instanceof z.ZodUnknown || schema instanceof z.ZodAny) {
    return {};
  }

  // Fallback for unhandled types — treat as any
  return {};
}

/**
 * Convert all tools in a registry to OpenAI ChatCompletionTool format.
 *
 * Accepts a duck-typed registry to avoid a hard dependency on @jarvis/tools.
 * The registry must implement list() and get(name).
 *
 * @example
 * const tools = toolDefinitionsToOpenAI(registry);
 * await router.completeWithTools(messages, 'mid', tools);
 */
export function toolDefinitionsToOpenAI(registry: ToolRegistryLike): ChatCompletionTool[] {
  return registry.list().map(({ name, description }) => {
    const toolDef = registry.get(name);
    if (!toolDef) {
      // Should never happen since list() and get() use the same backing map
      throw new Error(`toolDefinitionsToOpenAI: tool "${name}" was listed but not found`);
    }

    const parameters = zodToJsonSchema(toolDef.inputSchema as z.ZodType);

    return {
      type: 'function' as const,
      function: {
        name,
        description,
        parameters,
      },
    };
  });
}
