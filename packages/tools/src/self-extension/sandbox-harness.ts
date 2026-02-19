/**
 * Generates a complete .mjs harness script that the sandbox runner writes to disk
 * and forks as a child process. The harness imports the compiled tool JS, runs
 * execute() with the provided test input, and sends the result back via IPC.
 *
 * This pattern avoids needing sandbox-harness.ts to be separately compiled and
 * resolved at runtime — the temp .mjs file IS the harness.
 *
 * @param toolJsPath - Absolute path to the compiled tool .mjs file to import
 * @param testInput  - The input to pass to tool.execute() (serialized inline)
 * @returns A complete .mjs script string ready to be written to disk and forked
 */
export function generateHarnessScript(toolJsPath: string, testInput: unknown): string {
  const serializedInput = JSON.stringify(testInput);

  return `
import { createRequire } from 'node:module';

async function main() {
  const toolPath = ${JSON.stringify(toolJsPath)};
  const testInput = ${serializedInput};

  let mod;
  try {
    mod = await import(toolPath);
  } catch (err) {
    process.send({ passed: false, error: 'Failed to import tool: ' + String(err) });
    process.exit(1);
  }

  const tool = mod.default ?? mod.tool;
  if (!tool || typeof tool.execute !== 'function') {
    process.send({ passed: false, error: 'No valid tool definition found in module (missing execute function)' });
    process.exit(1);
  }

  try {
    const controller = new AbortController();
    const result = await tool.execute(testInput, controller.signal);
    process.send({ passed: true, output: result });
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.send({ passed: false, error: message });
    process.exit(1);
  }
}

main().catch((err) => {
  process.send({ passed: false, error: 'Harness fatal error: ' + String(err) });
  process.exit(1);
});
`.trimStart();
}
