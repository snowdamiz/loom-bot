import { agentState, eq } from '@jarvis/db';
import type { DbClient } from '@jarvis/db';
import { appendSelfExtensionEvent } from './lifecycle-events.js';
import {
  runGitHubRollbackPipeline,
  SELF_EXTENSION_KNOWN_GOOD_BASELINE_KEY,
  SELF_EXTENSION_PIPELINE_STATUS_KEY,
} from './github-pipeline.js';

const ROLLBACK_COOLDOWN_MS = 5 * 60 * 1000;

interface PipelineStatusSnapshot {
  status?: string;
  runId?: string;
  filePath?: string;
  previousBaselineSha?: string | null;
  rollback?: {
    status?: string;
    reason?: string;
    targetBaselineSha?: string;
    lastAttemptAt?: string;
    attemptId?: string;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}

export interface RunAutomatedRollbackInput {
  db: DbClient;
  reason: string;
  sourceRunId?: string | null;
  triggeredBy?: string | null;
}

export interface RunAutomatedRollbackResult {
  attempted: boolean;
  success: boolean;
  skipped: boolean;
  reason: string;
  runId: string;
  targetBaselineSha: string | null;
  branchName?: string;
  headSha?: string;
  pullRequestUrl?: string;
  pullRequestNumber?: number;
}

function parseObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function parsePipelineStatus(value: unknown): PipelineStatusSnapshot | null {
  const row = parseObject(value);
  if (!row) {
    return null;
  }
  return row as unknown as PipelineStatusSnapshot;
}

async function readAgentStateValue(db: DbClient, key: string): Promise<unknown> {
  const rows = await db
    .select()
    .from(agentState)
    .where(eq(agentState.key, key))
    .limit(1);
  return rows[0]?.value;
}

async function upsertAgentStateValue(db: DbClient, key: string, value: unknown): Promise<void> {
  const existingRows = await db
    .select()
    .from(agentState)
    .where(eq(agentState.key, key))
    .limit(1);

  if (existingRows.length > 0) {
    await db
      .update(agentState)
      .set({ value, updatedAt: new Date() })
      .where(eq(agentState.key, key));
    return;
  }

  await db.insert(agentState).values({ key, value });
}

function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== 'string') {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeRollbackReason(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : 'health-window-failed';
}

function evaluateRollbackIdempotency(input: {
  pipelineStatus: PipelineStatusSnapshot;
  targetBaselineSha: string;
  nowMs: number;
}): string | null {
  const rollback = input.pipelineStatus.rollback;
  if (!rollback || typeof rollback !== 'object') {
    return null;
  }

  const priorTarget = typeof rollback.targetBaselineSha === 'string'
    ? rollback.targetBaselineSha
    : null;
  if (!priorTarget || priorTarget !== input.targetBaselineSha) {
    return null;
  }

  const rollbackStatus = typeof rollback.status === 'string' ? rollback.status : null;
  if (rollbackStatus === 'in_progress') {
    return 'rollback-already-in-progress';
  }

  const lastAttemptAt = parseIsoDate(rollback.lastAttemptAt);
  if (!lastAttemptAt) {
    return null;
  }

  const ageMs = input.nowMs - lastAttemptAt.getTime();
  if (ageMs < ROLLBACK_COOLDOWN_MS) {
    return 'rollback-cooldown-active';
  }

  return null;
}

export async function runAutomatedRollback(
  input: RunAutomatedRollbackInput,
): Promise<RunAutomatedRollbackResult> {
  const now = new Date();
  const nowIso = now.toISOString();

  const pipelineStatus = parsePipelineStatus(
    await readAgentStateValue(input.db, SELF_EXTENSION_PIPELINE_STATUS_KEY),
  );
  const sourceRunId = input.sourceRunId?.trim()
    ? input.sourceRunId.trim()
    : typeof pipelineStatus?.runId === 'string'
      ? pipelineStatus.runId
      : `rollback-source-${Date.now()}`;
  const rollbackRunId = `rollback-${sourceRunId}-${Date.now()}`;

  if (!pipelineStatus) {
    return {
      attempted: false,
      success: false,
      skipped: true,
      reason: 'rollback-blocked-pipeline-status-missing',
      runId: rollbackRunId,
      targetBaselineSha: null,
    };
  }

  const targetBaselineSha = typeof pipelineStatus.previousBaselineSha === 'string'
    ? pipelineStatus.previousBaselineSha.trim()
    : '';
  const filePath = typeof pipelineStatus.filePath === 'string'
    ? pipelineStatus.filePath.trim()
    : '';

  if (!targetBaselineSha || !filePath) {
    const reason = !targetBaselineSha
      ? 'rollback-blocked-missing-target-baseline'
      : 'rollback-blocked-missing-file-path';

    await upsertAgentStateValue(input.db, SELF_EXTENSION_PIPELINE_STATUS_KEY, {
      ...pipelineStatus,
      status: 'rollback_failed',
      rollback: {
        status: 'failed',
        reason,
        targetBaselineSha: targetBaselineSha || null,
        filePath: filePath || null,
        lastAttemptAt: nowIso,
        attemptId: rollbackRunId,
      },
    });

    await appendSelfExtensionEvent(input.db, {
      runId: rollbackRunId,
      stage: 'rollback',
      eventType: 'rollback_failed',
      actorSource: input.triggeredBy ?? 'health-monitor',
      payload: {
        reason,
        sourceRunId,
        targetBaselineSha: targetBaselineSha || null,
        filePath: filePath || null,
      },
    });

    return {
      attempted: false,
      success: false,
      skipped: false,
      reason,
      runId: rollbackRunId,
      targetBaselineSha: targetBaselineSha || null,
    };
  }

  const idempotencyReason = evaluateRollbackIdempotency({
    pipelineStatus,
    targetBaselineSha,
    nowMs: now.getTime(),
  });
  if (idempotencyReason) {
    return {
      attempted: false,
      success: false,
      skipped: true,
      reason: idempotencyReason,
      runId: rollbackRunId,
      targetBaselineSha,
    };
  }

  const rollbackReason = normalizeRollbackReason(input.reason);

  await upsertAgentStateValue(input.db, SELF_EXTENSION_PIPELINE_STATUS_KEY, {
    ...pipelineStatus,
    status: 'rollback_in_progress',
    rollback: {
      status: 'in_progress',
      reason: rollbackReason,
      targetBaselineSha,
      filePath,
      sourceRunId,
      lastAttemptAt: nowIso,
      attemptId: rollbackRunId,
    },
  });

  await appendSelfExtensionEvent(input.db, {
    runId: rollbackRunId,
    stage: 'rollback',
    eventType: 'rollback_started',
    actorSource: input.triggeredBy ?? 'health-monitor',
    payload: {
      reason: rollbackReason,
      sourceRunId,
      targetBaselineSha,
      filePath,
    },
  });

  const rollbackResult = await runGitHubRollbackPipeline({
    db: input.db,
    filePath,
    targetBaselineSha,
    reason: rollbackReason,
    sourceRunId,
  });

  if (!rollbackResult.success) {
    const failureReason = rollbackResult.error ?? 'rollback-github-pipeline-failed';
    await upsertAgentStateValue(input.db, SELF_EXTENSION_PIPELINE_STATUS_KEY, {
      ...pipelineStatus,
      status: 'rollback_failed',
      rollback: {
        status: 'failed',
        reason: failureReason,
        targetBaselineSha,
        filePath,
        sourceRunId,
        lastAttemptAt: new Date().toISOString(),
        attemptId: rollbackRunId,
        branchName: rollbackResult.branchName ?? null,
        headSha: rollbackResult.headSha ?? null,
        pullRequestUrl: rollbackResult.pullRequestUrl ?? null,
        pullRequestNumber: rollbackResult.pullRequestNumber ?? null,
      },
    });

    await appendSelfExtensionEvent(input.db, {
      runId: rollbackRunId,
      stage: 'rollback',
      eventType: 'rollback_failed',
      actorSource: input.triggeredBy ?? 'health-monitor',
      payload: {
        reason: failureReason,
        sourceRunId,
        targetBaselineSha,
        filePath,
        branchName: rollbackResult.branchName ?? null,
        headSha: rollbackResult.headSha ?? null,
        pullRequestUrl: rollbackResult.pullRequestUrl ?? null,
        pullRequestNumber: rollbackResult.pullRequestNumber ?? null,
      },
    });

    return {
      attempted: true,
      success: false,
      skipped: false,
      reason: failureReason,
      runId: rollbackRunId,
      targetBaselineSha,
      branchName: rollbackResult.branchName,
      headSha: rollbackResult.headSha,
      pullRequestUrl: rollbackResult.pullRequestUrl,
      pullRequestNumber: rollbackResult.pullRequestNumber,
    };
  }

  await upsertAgentStateValue(input.db, SELF_EXTENSION_KNOWN_GOOD_BASELINE_KEY, {
    sha: targetBaselineSha,
    restoredAt: new Date().toISOString(),
    restoredBy: input.triggeredBy ?? 'health-monitor',
    sourceRunId,
    rollbackRunId,
    reason: rollbackReason,
    branchName: rollbackResult.branchName ?? null,
    headSha: rollbackResult.headSha ?? null,
    pullRequestUrl: rollbackResult.pullRequestUrl ?? null,
    pullRequestNumber: rollbackResult.pullRequestNumber ?? null,
  });

  await upsertAgentStateValue(input.db, SELF_EXTENSION_PIPELINE_STATUS_KEY, {
    ...pipelineStatus,
    status: 'rolled_back',
    rollback: {
      status: 'succeeded',
      reason: rollbackReason,
      targetBaselineSha,
      filePath,
      sourceRunId,
      lastAttemptAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      attemptId: rollbackRunId,
      branchName: rollbackResult.branchName ?? null,
      headSha: rollbackResult.headSha ?? null,
      pullRequestUrl: rollbackResult.pullRequestUrl ?? null,
      pullRequestNumber: rollbackResult.pullRequestNumber ?? null,
    },
  });

  await appendSelfExtensionEvent(input.db, {
    runId: rollbackRunId,
    stage: 'rollback',
    eventType: 'rolled_back',
    actorSource: input.triggeredBy ?? 'health-monitor',
    payload: {
      reason: rollbackReason,
      sourceRunId,
      targetBaselineSha,
      filePath,
      branchName: rollbackResult.branchName ?? null,
      headSha: rollbackResult.headSha ?? null,
      pullRequestUrl: rollbackResult.pullRequestUrl ?? null,
      pullRequestNumber: rollbackResult.pullRequestNumber ?? null,
    },
  });

  return {
    attempted: true,
    success: true,
    skipped: false,
    reason: 'rollback-succeeded',
    runId: rollbackRunId,
    targetBaselineSha,
    branchName: rollbackResult.branchName,
    headSha: rollbackResult.headSha,
    pullRequestUrl: rollbackResult.pullRequestUrl,
    pullRequestNumber: rollbackResult.pullRequestNumber,
  };
}
