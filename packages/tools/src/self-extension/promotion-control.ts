import { agentState, eq } from '@jarvis/db';
import type { DbClient } from '@jarvis/db';

const PROMOTION_CONTROL_KEY = 'self_extension:promotion_control';

export const PROMOTION_CONTROL_STATE_KEY = PROMOTION_CONTROL_KEY;

export interface PromotionControlState {
  paused: boolean;
  reason: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

type PersistedPromotionControlState = {
  paused?: unknown;
  reason?: unknown;
  updatedBy?: unknown;
  updatedAt?: unknown;
};

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parsePersistedPromotionControl(value: unknown): PromotionControlState | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const row = value as PersistedPromotionControlState;
  if (typeof row.paused !== 'boolean') {
    return null;
  }

  return {
    paused: row.paused,
    reason: normalizeOptionalString(row.reason),
    updatedBy: normalizeOptionalString(row.updatedBy),
    updatedAt: normalizeOptionalString(row.updatedAt),
  };
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

export async function getPromotionControlState(db: DbClient): Promise<PromotionControlState> {
  const rows = await db
    .select()
    .from(agentState)
    .where(eq(agentState.key, PROMOTION_CONTROL_KEY))
    .limit(1);

  const persisted = parsePersistedPromotionControl(rows[0]?.value);
  if (persisted) {
    return persisted;
  }

  return {
    paused: false,
    reason: null,
    updatedBy: null,
    updatedAt: null,
  };
}

export async function setPromotionControlState(
  db: DbClient,
  input: {
    paused: boolean;
    reason?: string | null;
    updatedBy?: string | null;
    updatedAt?: string | null;
  },
): Promise<PromotionControlState> {
  const nextState: PromotionControlState = {
    paused: input.paused,
    reason: input.paused ? normalizeOptionalString(input.reason) : null,
    updatedBy: normalizeOptionalString(input.updatedBy),
    updatedAt: normalizeOptionalString(input.updatedAt) ?? new Date().toISOString(),
  };

  await upsertAgentState(db, PROMOTION_CONTROL_KEY, nextState);
  return nextState;
}
