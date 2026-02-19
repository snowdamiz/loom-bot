import { createHash } from 'node:crypto';
import type { SelfExtensionExecutionContext } from './pipeline-context.js';

export interface BranchNameInput {
  executionContext: Pick<SelfExtensionExecutionContext, 'goalId' | 'cycleId' | 'subGoalId' | 'toolName'>;
  filePath: string;
  contentHash: string;
}

function toToken(value: string, fallback: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');

  if (!normalized) {
    return fallback;
  }

  return normalized.slice(0, 40);
}

function shortHash(value: string, length = 16): string {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}

export function buildSelfExtensionBranchName(input: BranchNameInput): string {
  const toolToken = toToken(String(input.executionContext.toolName), 'tool');
  const goalToken = toToken(String(input.executionContext.goalId), 'goal');
  const cycleToken = toToken(String(input.executionContext.cycleId), 'cycle');
  const subGoalToken = toToken(String(input.executionContext.subGoalId), 'subgoal');

  const fingerprintPayload = JSON.stringify({
    toolName: String(input.executionContext.toolName).trim(),
    filePath: input.filePath.trim(),
    contentHash: input.contentHash.trim(),
  });
  const fingerprint = shortHash(fingerprintPayload);

  return `jarvis/self-extension/${toolToken}/g${goalToken}-c${cycleToken}-s${subGoalToken}-${fingerprint}`;
}
