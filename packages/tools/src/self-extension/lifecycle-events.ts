import { selfExtensionEvents } from '@jarvis/db';
import type { DbClient } from '@jarvis/db';
import type { SelfExtensionExecutionContext } from './pipeline-context.js';

export const SELF_EXTENSION_EVENT_TYPES = [
  'proposed',
  'tested',
  'promotion_blocked',
  'promoted',
  'failed',
  'promotion_pause_changed',
  'rollback_started',
  'rolled_back',
  'rollback_failed',
  'health_window_failed',
  'health_window_passed',
] as const;

export type SelfExtensionLifecycleEventType = (typeof SELF_EXTENSION_EVENT_TYPES)[number];

export interface AppendSelfExtensionEventInput {
  runId: string;
  eventType: SelfExtensionLifecycleEventType;
  stage?: string | null;
  actorSource?: string | null;
  correlationId?: string | null;
  toolName?: string | null;
  toolCallId?: string | null;
  payload?: Record<string, unknown>;
  executionContext?: SelfExtensionExecutionContext | null;
}

export interface SelfExtensionEventWriteResult {
  id: number;
  runId: string;
  stage: string;
  eventType: SelfExtensionLifecycleEventType;
  createdAt: string;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRequiredString(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeContextId(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePayload(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export async function appendSelfExtensionEvent(
  db: DbClient,
  input: AppendSelfExtensionEventInput,
): Promise<SelfExtensionEventWriteResult> {
  const runId = normalizeRequiredString(input.runId, 'self-extension-run');
  const stage = normalizeRequiredString(input.stage ?? input.eventType, input.eventType);
  const context = input.executionContext ?? null;

  const insertedRows = await db
    .insert(selfExtensionEvents)
    .values({
      runId,
      correlationId: normalizeOptionalString(input.correlationId),
      stage,
      eventType: input.eventType,
      actorSource:
        normalizeOptionalString(input.actorSource ?? context?.actorSource) ?? 'tool-write',
      toolName: normalizeOptionalString(input.toolName ?? context?.toolName),
      toolCallId: normalizeOptionalString(input.toolCallId ?? context?.toolCallId),
      goalId: normalizeContextId(context?.goalId),
      cycleId: normalizeContextId(context?.cycleId),
      subGoalId: normalizeContextId(context?.subGoalId),
      payload: normalizePayload(input.payload),
    })
    .returning({
      id: selfExtensionEvents.id,
      runId: selfExtensionEvents.runId,
      stage: selfExtensionEvents.stage,
      createdAt: selfExtensionEvents.createdAt,
    });

  const inserted = insertedRows[0];
  if (!inserted) {
    throw new Error('Failed to insert self-extension lifecycle event.');
  }

  return {
    id: inserted.id,
    runId: inserted.runId,
    stage: inserted.stage,
    eventType: input.eventType,
    createdAt: inserted.createdAt instanceof Date
      ? inserted.createdAt.toISOString()
      : new Date().toISOString(),
  };
}
