import { z } from 'zod';
import { spawn } from 'node:child_process';
import type { ToolDefinition } from '../types.js';

/**
 * BOOT-01: Runtime package installation tool.
 *
 * Allows the agent to install npm packages at runtime via pnpm add, then
 * dynamically import the installed package. This enables self-provisioning:
 * the agent can install Browser Use, DevTools MCP, or any other library it
 * determines would be useful — without restarting the process.
 *
 * Per locked decision: fully autonomous npm installation, no approval required.
 * Packages persist permanently (added to the project's node_modules).
 *
 * shell: false per project convention — args passed as array to avoid injection.
 */

const inputSchema = z.object({
  packageSpec: z
    .string()
    .min(1)
    .describe(
      "npm package spec to install. Examples: 'lodash', 'axios@1.7.0', '@faker-js/faker@9.0.0'",
    ),
  importAfterInstall: z
    .boolean()
    .default(true)
    .describe(
      'Whether to dynamically import the package after install to verify it loaded. Default: true.',
    ),
});

type InstallInput = z.infer<typeof inputSchema>;

type InstallOutput =
  | {
      installed: true;
      packageSpec: string;
      imported: boolean;
      exports?: string[];
    }
  | {
      installed: false;
      error: string;
      exitCode: number | null;
    };

/**
 * Parse the package name from a spec string.
 *
 * Handles:
 *   'lodash'                   -> 'lodash'
 *   'lodash@4.17.21'           -> 'lodash'
 *   '@faker-js/faker'          -> '@faker-js/faker'
 *   '@faker-js/faker@9.0.0'    -> '@faker-js/faker'
 *   '@scope/pkg@1.0.0-beta.1'  -> '@scope/pkg'
 */
function parsePackageName(spec: string): string {
  if (spec.startsWith('@')) {
    // Scoped package: @scope/name or @scope/name@version
    // Split off the scope prefix, then find version on the name part
    const withoutAt = spec.slice(1); // 'scope/name@version' or 'scope/name'
    const slashIdx = withoutAt.indexOf('/');
    if (slashIdx === -1) {
      // Malformed scoped spec — return as-is
      return spec;
    }
    const scope = '@' + withoutAt.slice(0, slashIdx); // '@scope'
    const rest = withoutAt.slice(slashIdx + 1); // 'name@version' or 'name'
    const atIdx = rest.indexOf('@');
    const name = atIdx === -1 ? rest : rest.slice(0, atIdx);
    return `${scope}/${name}`;
  } else {
    // Non-scoped: 'name' or 'name@version'
    const atIdx = spec.indexOf('@');
    return atIdx === -1 ? spec : spec.slice(0, atIdx);
  }
}

/**
 * Run pnpm add <packageSpec> in the project root.
 * Returns { exitCode, stdout, stderr }.
 */
function runPnpmAdd(
  packageSpec: string,
  projectRoot: string,
  timeoutMs: number,
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('pnpm', ['add', packageSpec], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false, // per project decision: never use shell
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout?.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    // Timeout: kill the process if it takes too long
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, timeoutMs);

    child.on('close', (exitCode) => {
      clearTimeout(timer);
      resolve({
        exitCode,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        exitCode: null,
        stdout: '',
        stderr: err.message,
      });
    });
  });
}

/**
 * createInstallPackageTool() — returns the package_install ToolDefinition.
 */
export function createInstallPackageTool(): ToolDefinition<InstallInput, InstallOutput> {
  return {
    name: 'package_install',
    description:
      'Install an npm package at runtime via pnpm add, then dynamically import it. ' +
      'Use this to self-provision capabilities: install Browser Use, DevTools MCP, or any ' +
      'library the agent needs. Packages persist permanently. No human approval required. ' +
      'Example specs: "lodash", "axios@1.7.0", "@faker-js/faker@9.0.0".',
    inputSchema,
    timeoutMs: 120_000, // pnpm install can be slow for large packages
    maxOutputBytes: 4096,

    async execute(input: InstallInput, signal: AbortSignal): Promise<InstallOutput> {
      const { packageSpec, importAfterInstall } = input;

      // Project root: the agent process runs from the monorepo root (cwd = project root)
      const projectRoot = process.cwd();

      // Check for abort before starting install
      if (signal.aborted) {
        return {
          installed: false,
          error: 'Operation aborted',
          exitCode: null,
        };
      }

      const { exitCode, stderr } = await runPnpmAdd(packageSpec, projectRoot, 115_000);

      if (signal.aborted) {
        return {
          installed: false,
          error: 'Operation aborted during install',
          exitCode: null,
        };
      }

      if (exitCode !== 0) {
        return {
          installed: false,
          error: stderr || 'pnpm add failed with no stderr output',
          exitCode,
        };
      }

      // Install succeeded
      if (!importAfterInstall) {
        return {
          installed: true,
          packageSpec,
          imported: false,
        };
      }

      // Dynamic import to verify the package loaded
      const packageName = parsePackageName(packageSpec);
      try {
        const mod = await import(packageName);
        const exports = Object.keys(mod).slice(0, 20); // cap at 20 export names
        return {
          installed: true,
          packageSpec,
          imported: true,
          exports,
        };
      } catch {
        // Package installed but import failed (e.g., Node.js-incompatible ESM, etc.)
        return {
          installed: true,
          packageSpec,
          imported: false,
          exports: [],
        };
      }
    },
  };
}
