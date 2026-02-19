/**
 * Internal execution metadata threaded through tool invocation for
 * deterministic self-extension traceability.
 */
export interface SelfExtensionExecutionContext {
  goalId: number | string | null;
  cycleId: number | string | null;
  subGoalId: number | string | null;
  toolName: string;
  toolCallId?: string | null;
  actorSource?: string | null;
}

export interface CommitMetadataPayload {
  schemaVersion: 1;
  goalId: string | null;
  cycleId: string | null;
  subGoalId: string | null;
  toolName: string;
  toolCallId: string | null;
  actorSource: string | null;
}

export interface CommitMetadataEnvelope {
  payload: CommitMetadataPayload;
  serialized: string;
}

function normalizeRequired(value: number | string | null): string | null {
  if (value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptional(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeToolName(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : 'unknown_tool';
}

function orderKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => orderKeys(item));
  }
  if (value && typeof value === 'object') {
    const ordered: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      ordered[key] = orderKeys((value as Record<string, unknown>)[key]);
    }
    return ordered;
  }
  return value;
}

export function stableSerialize(value: unknown): string {
  return JSON.stringify(orderKeys(value));
}

export function buildCommitMetadata(
  context: SelfExtensionExecutionContext,
): CommitMetadataEnvelope {
  const payload: CommitMetadataPayload = {
    schemaVersion: 1,
    goalId: normalizeRequired(context.goalId),
    cycleId: normalizeRequired(context.cycleId),
    subGoalId: normalizeRequired(context.subGoalId),
    toolName: normalizeToolName(context.toolName),
    toolCallId: normalizeOptional(context.toolCallId),
    actorSource: normalizeOptional(context.actorSource),
  };

  return {
    payload,
    serialized: stableSerialize(payload),
  };
}
