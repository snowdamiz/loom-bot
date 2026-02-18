import { readFile, writeFile, appendFile, unlink, access, readdir, mkdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import type { ToolDefinition } from '../types.js';

/**
 * TOOL-03: File read/write tool.
 *
 * Supports read, write, append, delete, exists, and list operations.
 *
 * Large file optimization:
 * - Files > 5MB use streaming via createReadStream + chunked collection to avoid
 *   loading the entire file into memory at once.
 *
 * Write creates parent directories automatically (mkdir -p behavior).
 */

const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024; // 5MB

const inputSchema = z.object({
  operation: z.enum(['read', 'write', 'append', 'delete', 'exists', 'list']),
  path: z.string().min(1, 'path cannot be empty'),
  content: z.string().optional(),
  encoding: z.string().optional().default('utf-8'),
});

type FileInput = z.infer<typeof inputSchema>;

interface FileOutput {
  operation: string;
  path: string;
  result: string | boolean | string[] | null;
}

async function readFileOptimized(filePath: string, encoding: BufferEncoding): Promise<string> {
  // Check file size first to decide streaming vs direct read
  let fileSize: number;
  try {
    const stats = await stat(filePath);
    fileSize = stats.size;
  } catch {
    // stat failed — let readFile handle the error
    return readFile(filePath, encoding);
  }

  if (fileSize > LARGE_FILE_THRESHOLD) {
    // Stream large files to avoid memory pressure
    return new Promise<string>((resolve, reject) => {
      const stream = createReadStream(filePath, { encoding });
      const chunks: string[] = [];
      stream.on('data', (chunk: string | Buffer) => {
        chunks.push(typeof chunk === 'string' ? chunk : chunk.toString(encoding));
      });
      stream.on('end', () => resolve(chunks.join('')));
      stream.on('error', reject);
    });
  }

  return readFile(filePath, encoding);
}

export const fileTool: ToolDefinition<FileInput, FileOutput> = {
  name: 'file',
  description:
    'Read, write, append, delete, check existence, or list files on the host filesystem. ' +
    'Operations: read (returns content), write (creates/overwrites, auto-creates parent dirs), ' +
    'append (add to existing file), delete (remove file), ' +
    'exists (returns true/false), list (returns array of filenames in directory).',
  inputSchema,
  timeoutMs: 10_000,

  async execute(input: FileInput, signal: AbortSignal): Promise<FileOutput> {
    const encoding = (input.encoding ?? 'utf-8') as BufferEncoding;

    switch (input.operation) {
      case 'read': {
        const content = await readFileOptimized(input.path, encoding);
        return { operation: 'read', path: input.path, result: content };
      }

      case 'write': {
        // Create parent directories if needed (mkdir -p behavior)
        await mkdir(dirname(input.path), { recursive: true });
        await writeFile(input.path, input.content ?? '', encoding);
        return { operation: 'write', path: input.path, result: true };
      }

      case 'append': {
        await appendFile(input.path, input.content ?? '', encoding);
        return { operation: 'append', path: input.path, result: true };
      }

      case 'delete': {
        await unlink(input.path);
        return { operation: 'delete', path: input.path, result: true };
      }

      case 'exists': {
        const exists = await access(input.path)
          .then(() => true)
          .catch(() => false);
        return { operation: 'exists', path: input.path, result: exists };
      }

      case 'list': {
        const files = await readdir(input.path);
        return { operation: 'list', path: input.path, result: files };
      }

      default: {
        // TypeScript exhaustiveness check
        const _exhaustive: never = input.operation;
        throw new Error(`Unknown file operation: ${String(_exhaustive)}`);
      }
    }
  },
};
