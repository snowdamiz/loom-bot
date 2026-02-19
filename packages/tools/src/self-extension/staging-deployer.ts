import { simpleGit } from 'simple-git';
import type { StatusResultRenamed } from 'simple-git';
import { writeFileSync } from 'node:fs';
import { compileTypeScript } from './compiler.js';
import { runInSandbox } from './sandbox-runner.js';

/**
 * stageBuiltinChange — applies a modification to a built-in tool via git branch staging.
 *
 * Flow:
 *  1. Record current branch name
 *  2. Verify working tree is clean for the target file
 *  3. Create a new staging branch
 *  4. Write new content, stage, and commit
 *  5. Compile and sandbox test the new content
 *  6. If test passes: checkout original branch, merge staging branch with --ff-only, delete staging branch
 *  7. If test fails: checkout original branch, force-delete staging branch, return error
 *
 * IMPORTANT: Does NOT assume 'main' — uses the branch name captured before staging.
 */
export async function stageBuiltinChange(opts: {
  toolName: string;
  filePath: string;
  newContent: string;
  testInput: unknown;
}): Promise<{ success: boolean; error?: string }> {
  const git = simpleGit(process.cwd());
  const branchName = `agent/builtin-mod/${opts.toolName}-${Date.now()}`;
  let originalBranch: string = 'main';

  try {
    // Step 1: Record current branch BEFORE creating staging branch
    const rawBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
    originalBranch = rawBranch.trim();

    // Step 2: Verify working tree is clean for the target file
    const status = await git.status();
    const allDirty = [
      ...status.modified,
      ...status.not_added,
      ...status.created,
      ...status.deleted,
      ...status.renamed.map((r: StatusResultRenamed) => r.to),
      ...status.renamed.map((r: StatusResultRenamed) => r.from),
    ];
    const isDirty = allDirty.some((f) => f === opts.filePath || f.endsWith(`/${opts.filePath}`) || opts.filePath.endsWith(`/${f}`));
    if (isDirty) {
      return {
        success: false,
        error: `Working tree has uncommitted changes for ${opts.filePath}`,
      };
    }

    // Step 3: Create staging branch
    await git.checkoutLocalBranch(branchName);

    // Step 4: Write new content, stage, commit
    writeFileSync(opts.filePath, opts.newContent, 'utf-8');
    await git.add(opts.filePath);
    await git.commit(`agent: modify builtin tool ${opts.toolName}`);

    // Step 5: Compile the new content
    const { code } = await compileTypeScript(opts.newContent);

    // Step 6: Sandbox test
    const result = await runInSandbox(code, opts.toolName, opts.testInput, 30_000);

    if (!result.passed) {
      // Test failed: abandon staging branch, return to original
      await git.checkout(originalBranch);
      await git.deleteLocalBranch(branchName, true);
      return {
        success: false,
        error: `Sandbox test failed: ${result.error}`,
      };
    }

    // Step 7: Test passed: merge into original branch
    await git.checkout(originalBranch);
    await git.merge([branchName, '--ff-only']);
    await git.deleteLocalBranch(branchName);
    return { success: true };
  } catch (err) {
    // Cleanup: try to return to original branch and delete staging branch
    if (originalBranch) {
      try {
        await git.checkout(originalBranch);
      } catch {
        // Best-effort
      }
    }
    try {
      await git.deleteLocalBranch(branchName, true);
    } catch {
      // Best-effort
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
