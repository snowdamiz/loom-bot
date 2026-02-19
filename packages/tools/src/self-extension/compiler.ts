import * as esbuild from 'esbuild';

/**
 * Compiles a TypeScript source string to runnable JavaScript using esbuild.transform.
 * No disk I/O is performed — compilation happens entirely in memory.
 *
 * esbuild.transform() throws a TransformFailure (which has .errors[]) on compilation
 * errors, so we use try/catch to produce a descriptive error message.
 *
 * @param tsSource - The TypeScript source code to compile
 * @returns Compiled JavaScript code and any warning messages
 * @throws Error with descriptive message if the source has TypeScript compilation errors
 */
export async function compileTypeScript(
  tsSource: string
): Promise<{ code: string; warnings: string[] }> {
  let result: esbuild.TransformResult;
  try {
    result = await esbuild.transform(tsSource, {
      loader: 'ts',
      format: 'esm',
      target: 'node20',
      platform: 'node',
    });
  } catch (err) {
    // esbuild throws TransformFailure with .errors[] on compilation failure
    if (err && typeof err === 'object' && 'errors' in err) {
      const failure = err as esbuild.TransformFailure;
      const errorText = failure.errors.map((e) => e.text).join('\n');
      throw new Error(`TypeScript compilation failed:\n${errorText}`);
    }
    throw err;
  }

  return {
    code: result.code,
    warnings: result.warnings.map((w) => w.text),
  };
}
