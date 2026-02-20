import { agentState, eq } from '@jarvis/db';
import type { DbClient } from '@jarvis/db';
import {
  runAutomatedRollback,
  SELF_EXTENSION_KNOWN_GOOD_BASELINE_KEY,
  SELF_EXTENSION_PIPELINE_STATUS_KEY,
} from '@jarvis/tools';

const LOOP_HEALTH_KEY = 'system:loop_health';

const DEFAULT_MONITOR_INTERVAL_MS = 15_000;
const DEFAULT_HEARTBEAT_STALE_MS = 120_000;

interface PipelineStatusSnapshot {
  status?: string;
  runId?: string;
  headSha?: string;
  toolName?: string;
  filePath?: string;
  pullRequestNumber?: number | null;
  pullRequestUrl?: string | null;
  previousBaselineSha?: string | null;
  promotedAt?: string;
  healthDeadlineAt?: string;
  [key: string]: unknown;
}

interface LoopHealthSnapshot {
  status?: string;
  lastHeartbeatAt?: string;
  [key: string]: unknown;
}

interface HealthEvaluation {
  healthy: boolean;
  reason: string;
  heartbeatAgeMs: number | null;
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

function parseLoopHealth(value: unknown): LoopHealthSnapshot | null {
  const row = parseObject(value);
  if (!row) {
    return null;
  }
  return row as unknown as LoopHealthSnapshot;
}

async function upsertAgentState(db: DbClient, key: string, value: unknown): Promise<void> {
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

async function loadAgentState(db: DbClient, key: string): Promise<unknown> {
  const rows = await db
    .select()
    .from(agentState)
    .where(eq(agentState.key, key))
    .limit(1);
  return rows[0]?.value;
}

function evaluateLoopHealth(
  snapshot: LoopHealthSnapshot | null,
  heartbeatStaleMs: number,
): HealthEvaluation {
  if (!snapshot) {
    return {
      healthy: false,
      reason: 'loop-health-missing',
      heartbeatAgeMs: null,
    };
  }

  const lastHeartbeatRaw = typeof snapshot.lastHeartbeatAt === 'string'
    ? snapshot.lastHeartbeatAt
    : null;
  if (!lastHeartbeatRaw) {
    return {
      healthy: false,
      reason: 'loop-heartbeat-missing',
      heartbeatAgeMs: null,
    };
  }

  const lastHeartbeat = new Date(lastHeartbeatRaw);
  if (Number.isNaN(lastHeartbeat.getTime())) {
    return {
      healthy: false,
      reason: 'loop-heartbeat-invalid',
      heartbeatAgeMs: null,
    };
  }

  const heartbeatAgeMs = Date.now() - lastHeartbeat.getTime();
  if (heartbeatAgeMs > heartbeatStaleMs) {
    return {
      healthy: false,
      reason: 'loop-heartbeat-stale',
      heartbeatAgeMs,
    };
  }

  const status = typeof snapshot.status === 'string' ? snapshot.status : 'unknown';
  if (status !== 'ok') {
    return {
      healthy: false,
      reason: status === 'error' ? 'loop-heartbeat-error' : `loop-heartbeat-${status}`,
      heartbeatAgeMs,
    };
  }

  return {
    healthy: true,
    reason: 'loop-healthy',
    heartbeatAgeMs,
  };
}

async function tickSelfExtensionHealthMonitor(
  db: DbClient,
  heartbeatStaleMs: number,
): Promise<void> {
  const pipelineSnapshot = parsePipelineStatus(
    await loadAgentState(db, SELF_EXTENSION_PIPELINE_STATUS_KEY),
  );
  if (!pipelineSnapshot || pipelineSnapshot.status !== 'promoted_pending_health') {
    return;
  }

  const nowIso = new Date().toISOString();
  const deadlineRaw = typeof pipelineSnapshot.healthDeadlineAt === 'string'
    ? pipelineSnapshot.healthDeadlineAt
    : null;
  const deadlineAt = deadlineRaw ? new Date(deadlineRaw) : null;
  const deadlinePassed = deadlineAt ? Date.now() >= deadlineAt.getTime() : false;

  const loopHealth = parseLoopHealth(await loadAgentState(db, LOOP_HEALTH_KEY));
  const evaluation = evaluateLoopHealth(loopHealth, heartbeatStaleMs);

  if (evaluation.healthy) {
    const headSha = typeof pipelineSnapshot.headSha === 'string'
      ? pipelineSnapshot.headSha
      : null;

    if (headSha) {
      await upsertAgentState(db, SELF_EXTENSION_KNOWN_GOOD_BASELINE_KEY, {
        sha: headSha,
        confirmedAt: nowIso,
        sourceRunId:
          typeof pipelineSnapshot.runId === 'string' ? pipelineSnapshot.runId : null,
        toolName:
          typeof pipelineSnapshot.toolName === 'string' ? pipelineSnapshot.toolName : null,
        filePath:
          typeof pipelineSnapshot.filePath === 'string' ? pipelineSnapshot.filePath : null,
        pullRequestNumber:
          typeof pipelineSnapshot.pullRequestNumber === 'number'
            ? pipelineSnapshot.pullRequestNumber
            : null,
        pullRequestUrl:
          typeof pipelineSnapshot.pullRequestUrl === 'string'
            ? pipelineSnapshot.pullRequestUrl
            : null,
      });
    }

    await upsertAgentState(db, SELF_EXTENSION_PIPELINE_STATUS_KEY, {
      ...pipelineSnapshot,
      status: 'health_passed',
      healthCheckedAt: nowIso,
      healthCheckReason: evaluation.reason,
      healthHeartbeatAgeMs: evaluation.heartbeatAgeMs,
      healthFailedAt: null,
      healthFailureReason: null,
    });
    return;
  }

  if (!deadlinePassed) {
    await upsertAgentState(db, SELF_EXTENSION_PIPELINE_STATUS_KEY, {
      ...pipelineSnapshot,
      status: 'promoted_pending_health',
      healthCheckedAt: nowIso,
      healthCheckReason: evaluation.reason,
      healthHeartbeatAgeMs: evaluation.heartbeatAgeMs,
    });
    return;
  }

  await upsertAgentState(db, SELF_EXTENSION_PIPELINE_STATUS_KEY, {
    ...pipelineSnapshot,
    status: 'health_failed',
    healthCheckedAt: nowIso,
    healthFailedAt: nowIso,
    healthFailureReason: evaluation.reason,
    healthHeartbeatAgeMs: evaluation.heartbeatAgeMs,
  });

  await runAutomatedRollback({
    db,
    reason: evaluation.reason,
    sourceRunId:
      typeof pipelineSnapshot.runId === 'string' ? pipelineSnapshot.runId : null,
    triggeredBy: 'health-monitor',
  });
}

/**
 * Starts a non-fatal background monitor that evaluates post-promotion health windows
 * from persisted state, so decisions remain deterministic across restarts.
 */
export function startSelfExtensionHealthMonitor(input: {
  db: DbClient;
  intervalMs?: number;
  heartbeatStaleMs?: number;
}): NodeJS.Timeout {
  const intervalMs = input.intervalMs ?? DEFAULT_MONITOR_INTERVAL_MS;
  const heartbeatStaleMs = input.heartbeatStaleMs ?? DEFAULT_HEARTBEAT_STALE_MS;

  const tick = async () => {
    try {
      await tickSelfExtensionHealthMonitor(input.db, heartbeatStaleMs);
    } catch (err) {
      process.stderr.write(
        `[self-extension-health] monitor tick failed: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  };

  void tick();
  return setInterval(() => {
    void tick();
  }, intervalMs);
}
