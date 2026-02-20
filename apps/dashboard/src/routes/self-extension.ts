import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import {
  db,
  agentState,
  desc,
  eq,
  selfExtensionEvents,
} from '@jarvis/db';
import {
  appendSelfExtensionEvent,
  getPromotionControlState,
  setPromotionControlState,
  SELF_EXTENSION_KNOWN_GOOD_BASELINE_KEY,
  SELF_EXTENSION_PIPELINE_STATUS_KEY,
} from '@jarvis/tools';
import { broadcaster } from '../broadcaster.js';

interface PipelineSnapshot {
  status?: string;
  runId?: string;
  branchName?: string;
  headSha?: string;
  pullRequestNumber?: number | null;
  pullRequestUrl?: string | null;
  healthDeadlineAt?: string | null;
  healthFailureReason?: string | null;
  verificationOverallStatus?: string | null;
  verificationFailedStage?: string | null;
  rollback?: {
    status?: string;
    reason?: string;
    targetBaselineSha?: string | null;
    attemptId?: string | null;
    pullRequestNumber?: number | null;
    pullRequestUrl?: string | null;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}

interface BaselineSnapshot {
  sha?: string;
  confirmedAt?: string | null;
  restoredAt?: string | null;
  sourceRunId?: string | null;
  [key: string]: unknown;
}

interface EventSnapshot {
  id: number | null;
  runId: string | null;
  stage: string | null;
  eventType: string | null;
  createdAt: string | null;
  payload: Record<string, unknown> | null;
}

export interface SelfExtensionStatusResponse {
  promotionPaused: boolean;
  promotionPauseReason: string | null;
  promotionPauseUpdatedBy: string | null;
  promotionPauseUpdatedAt: string | null;
  pipelineStatus: string;
  lastRunId: string | null;
  branchName: string | null;
  headSha: string | null;
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;
  healthDeadlineAt: string | null;
  healthFailureReason: string | null;
  verificationOverallStatus: string | null;
  verificationFailedStage: string | null;
  rollback: {
    attempted: boolean;
    status: string | null;
    reason: string | null;
    targetBaselineSha: string | null;
    runId: string | null;
    pullRequestNumber: number | null;
    pullRequestUrl: string | null;
  };
  knownGoodBaseline: {
    sha: string | null;
    confirmedAt: string | null;
    restoredAt: string | null;
    sourceRunId: string | null;
  };
  latestEvent: EventSnapshot;
}

const app = new Hono();

const promotionControlSchema = z.object({
  action: z.enum(['pause', 'resume']),
  reason: z.string().trim().min(1).max(500).optional(),
});

function parseObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function parsePipelineSnapshot(value: unknown): PipelineSnapshot | null {
  const row = parseObject(value);
  if (!row) {
    return null;
  }
  return row as unknown as PipelineSnapshot;
}

function parseBaselineSnapshot(value: unknown): BaselineSnapshot | null {
  const row = parseObject(value);
  if (!row) {
    return null;
  }
  return row as unknown as BaselineSnapshot;
}

function asStringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseEventPayload(value: unknown): Record<string, unknown> | null {
  const row = parseObject(value);
  return row ?? null;
}

export async function readSelfExtensionSnapshot(): Promise<SelfExtensionStatusResponse> {
  const [pipelineRows, baselineRows, latestEvents, promotionControl] = await Promise.all([
    db
      .select()
      .from(agentState)
      .where(eq(agentState.key, SELF_EXTENSION_PIPELINE_STATUS_KEY))
      .limit(1),
    db
      .select()
      .from(agentState)
      .where(eq(agentState.key, SELF_EXTENSION_KNOWN_GOOD_BASELINE_KEY))
      .limit(1),
    db
      .select({
        id: selfExtensionEvents.id,
        runId: selfExtensionEvents.runId,
        stage: selfExtensionEvents.stage,
        eventType: selfExtensionEvents.eventType,
        createdAt: selfExtensionEvents.createdAt,
        payload: selfExtensionEvents.payload,
      })
      .from(selfExtensionEvents)
      .orderBy(desc(selfExtensionEvents.id))
      .limit(1),
    getPromotionControlState(db),
  ]);

  const pipeline = parsePipelineSnapshot(pipelineRows[0]?.value);
  const baseline = parseBaselineSnapshot(baselineRows[0]?.value);
  const rollback = pipeline?.rollback;
  const latestEventRow = latestEvents[0];

  return {
    promotionPaused: promotionControl.paused,
    promotionPauseReason: promotionControl.reason,
    promotionPauseUpdatedBy: promotionControl.updatedBy,
    promotionPauseUpdatedAt: promotionControl.updatedAt,
    pipelineStatus: asStringOrNull(pipeline?.status) ?? 'idle',
    lastRunId: asStringOrNull(pipeline?.runId),
    branchName: asStringOrNull(pipeline?.branchName),
    headSha: asStringOrNull(pipeline?.headSha),
    pullRequestNumber: asNumberOrNull(pipeline?.pullRequestNumber),
    pullRequestUrl: asStringOrNull(pipeline?.pullRequestUrl),
    healthDeadlineAt: asStringOrNull(pipeline?.healthDeadlineAt),
    healthFailureReason: asStringOrNull(pipeline?.healthFailureReason),
    verificationOverallStatus: asStringOrNull(pipeline?.verificationOverallStatus),
    verificationFailedStage: asStringOrNull(pipeline?.verificationFailedStage),
    rollback: {
      attempted: asStringOrNull(rollback?.status) !== null,
      status: asStringOrNull(rollback?.status),
      reason: asStringOrNull(rollback?.reason),
      targetBaselineSha: asStringOrNull(rollback?.targetBaselineSha),
      runId: asStringOrNull(rollback?.attemptId),
      pullRequestNumber: asNumberOrNull(rollback?.pullRequestNumber),
      pullRequestUrl: asStringOrNull(rollback?.pullRequestUrl),
    },
    knownGoodBaseline: {
      sha: asStringOrNull(baseline?.sha),
      confirmedAt: asStringOrNull(baseline?.confirmedAt),
      restoredAt: asStringOrNull(baseline?.restoredAt),
      sourceRunId: asStringOrNull(baseline?.sourceRunId),
    },
    latestEvent: {
      id: latestEventRow?.id ?? null,
      runId: asStringOrNull(latestEventRow?.runId),
      stage: asStringOrNull(latestEventRow?.stage),
      eventType: asStringOrNull(latestEventRow?.eventType),
      createdAt:
        latestEventRow?.createdAt instanceof Date
          ? latestEventRow.createdAt.toISOString()
          : null,
      payload: parseEventPayload(latestEventRow?.payload),
    },
  };
}

app.get('/', async (c) => {
  const snapshot = await readSelfExtensionSnapshot();
  return c.json(snapshot);
});

app.post('/promotion', zValidator('json', promotionControlSchema), async (c) => {
  const body = c.req.valid('json');
  if (body.action === 'pause' && !body.reason) {
    return c.json({ error: 'reason is required when action is pause' }, 400);
  }

  const previousState = await getPromotionControlState(db);
  const nextPaused = body.action === 'pause';
  const nextState = await setPromotionControlState(db, {
    paused: nextPaused,
    reason: nextPaused ? body.reason ?? null : null,
    updatedBy: 'dashboard',
  });

  const event = await appendSelfExtensionEvent(db, {
    runId: `promotion-control-${Date.now()}`,
    stage: 'promotion-control',
    eventType: 'promotion_pause_changed',
    actorSource: 'dashboard-api',
    payload: {
      action: body.action,
      paused: nextState.paused,
      reason: nextState.reason,
      previousPaused: previousState.paused,
      previousReason: previousState.reason,
      updatedBy: nextState.updatedBy,
      updatedAt: nextState.updatedAt,
    },
  });

  const snapshot = await readSelfExtensionSnapshot();
  broadcaster.emit('update', 'self_extension', snapshot);

  return c.json({
    ok: true,
    action: body.action,
    promotionPaused: nextState.paused,
    reason: nextState.reason,
    updatedAt: nextState.updatedAt,
    eventId: event.id,
  });
});

export default app;
