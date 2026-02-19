import { fork } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { generateHarnessScript } from './sandbox-harness.js';

/**
 * The result returned by runInSandbox().
 * Never throws — all outcomes (success, failure, timeout) are expressed as SandboxResult.
 */
export interface SandboxResult {
  passed: boolean;
  output?: unknown;
  error?: string;
}

/**
 * Runs compiled JavaScript in a forked child process, completely isolated from the parent.
 * A child process crash, exception, or timeout does not affect the parent process.
 *
 * The compiled JS is written to a temp .mjs file and a harness script imports and
 * runs it, sending the result back via IPC (process.send / child.on('message')).
 *
 * @param compiledJs - The compiled JavaScript (ESM) to test
 * @param toolName   - Used to name temp files (should be URL-safe)
 * @param testInput  - Input to pass to the tool's execute() function
 * @param timeoutMs  - Maximum execution time; defaults to 30 seconds
 * @returns SandboxResult — never throws
 */
export async function runInSandbox(
  compiledJs: string,
  toolName: string,
  testInput: unknown,
  timeoutMs = 30_000
): Promise<SandboxResult> {
  const ts = Date.now();
  const toolPath = `/tmp/sandbox-${toolName}-${ts}.mjs`;
  const harnessPath = `/tmp/sandbox-harness-${toolName}-${ts}.mjs`;

  // Write both temp files before forking
  writeFileSync(toolPath, compiledJs, 'utf8');
  const harnessScript = generateHarnessScript(toolPath, testInput);
  writeFileSync(harnessPath, harnessScript, 'utf8');

  return new Promise<SandboxResult>((resolve) => {
    let settled = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const ipcMessages: unknown[] = [];

    const cleanup = () => {
      try { unlinkSync(toolPath); } catch { /* ignore */ }
      try { unlinkSync(harnessPath); } catch { /* ignore */ }
    };

    const settle = (result: SandboxResult) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      cleanup();
      resolve(result);
    };

    let child: ReturnType<typeof fork>;
    try {
      child = fork(harnessPath, [], {
        silent: true,
        execArgv: [],
      });
    } catch (err) {
      cleanup();
      resolve({
        passed: false,
        error: `Failed to fork sandbox process: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }

    child.on('message', (msg) => {
      ipcMessages.push(msg);
    });

    timeoutHandle = setTimeout(() => {
      if (!settled) {
        child.kill('SIGKILL');
        settle({ passed: false, error: `Sandbox timeout after ${timeoutMs}ms` });
      }
    }, timeoutMs);

    child.on('exit', (code) => {
      if (settled) return;
      const firstMessage = ipcMessages[0] as SandboxResult | undefined;
      if (code === 0 && firstMessage) {
        settle(firstMessage);
      } else if (firstMessage) {
        // Non-zero exit but we got an IPC message — use it
        settle(firstMessage);
      } else {
        settle({
          passed: false,
          error: `Sandbox process exited with code ${code ?? 'null'} and no IPC result`,
        });
      }
    });

    child.on('error', (err) => {
      settle({ passed: false, error: err.message });
    });
  });
}
