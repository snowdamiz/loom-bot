import { z } from 'zod';
import got from 'got';
import { CookieJar } from 'tough-cookie';
import type { ToolDefinition } from '../types.js';

/**
 * TOOL-02: HTTP request tool with cookie jar and redirect following.
 *
 * Uses got v14 with:
 * - CookieJar from tough-cookie: persists cookies across requests within the same session
 * - throwHttpErrors: false: 4xx/5xx are returned as structured results, not exceptions
 * - followRedirect: true with max 10 redirects by default
 * - responseType: 'text': always receive raw text; parse JSON optionally
 * - AbortSignal integration: signal is passed to got natively
 *
 * Returns status, headers, body. If Content-Type is application/json, also includes
 * parsedBody for convenience (null if parse fails — non-fatal).
 */

const inputSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  url: z.string().url('url must be a valid URL'),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
  json: z.unknown().optional(),
  followRedirects: z.boolean().optional().default(true),
  maxRedirects: z.number().int().positive().optional().default(10),
});

type HttpInput = z.infer<typeof inputSchema>;

interface HttpOutput {
  status: number;
  headers: Record<string, string>;
  body: string;
  /** Parsed JSON body if Content-Type is application/json. null if parsing failed. */
  parsedBody?: unknown;
}

/**
 * Shared got instance with persistent cookie jar for this session.
 * The CookieJar carries cookies across multiple requests (e.g., login → authenticated requests).
 */
const cookieJar = new CookieJar();

const gotClient = got.extend({
  cookieJar,
  followRedirect: true,
  maxRedirects: 10,
  throwHttpErrors: false, // 4xx/5xx returned as results, not exceptions
  responseType: 'text',
});

export const httpTool: ToolDefinition<HttpInput, HttpOutput> = {
  name: 'http',
  description:
    'Make HTTP requests (GET, POST, PUT, DELETE, PATCH). ' +
    'Supports headers, JSON/text body, redirect following, and persistent cookie jar. ' +
    '4xx/5xx responses are returned as structured results (not thrown as errors).',
  inputSchema,
  timeoutMs: 30_000,

  async execute(input: HttpInput, signal: AbortSignal): Promise<HttpOutput> {
    // Build request headers
    const headers: Record<string, string> = { ...input.headers };

    // Serialize json body if provided
    let body: string | undefined = input.body;
    if (input.json !== undefined) {
      body = JSON.stringify(input.json);
      if (!headers['content-type'] && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
    }

    const response = await gotClient(input.url, {
      method: input.method,
      headers,
      body,
      followRedirect: input.followRedirects,
      maxRedirects: input.maxRedirects,
      signal,
    });

    // Flatten headers (got returns HeadersInit which can have array values)
    const flatHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(response.headers)) {
      if (Array.isArray(value)) {
        flatHeaders[key] = value.join(', ');
      } else if (value !== undefined) {
        flatHeaders[key] = value;
      }
    }

    const responseBody = response.body as string;

    // Optionally parse JSON body for convenience
    let parsedBody: unknown | undefined;
    const contentType = flatHeaders['content-type'] ?? '';
    if (contentType.includes('application/json')) {
      try {
        parsedBody = JSON.parse(responseBody);
      } catch {
        parsedBody = null;
      }
    }

    const output: HttpOutput = {
      status: response.statusCode,
      headers: flatHeaders,
      body: responseBody,
    };

    if (parsedBody !== undefined) {
      output.parsedBody = parsedBody;
    }

    return output;
  },
};
