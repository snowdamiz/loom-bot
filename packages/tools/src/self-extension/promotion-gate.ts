export interface PromotionStatusContext {
  context: string;
  state: string;
}

export interface PromotionGateResult {
  ready: boolean;
  blocked: boolean;
  requiredContexts: string[];
  missingContexts: string[];
  pendingContexts: string[];
  failingContexts: string[];
  blockReasons: string[];
}

export const DEFAULT_PROMOTION_CONTEXTS = ['jarvis/sandbox'] as const;

const SUCCESS_STATES = new Set(['success']);
const PENDING_STATES = new Set(['pending']);
const FAILING_STATES = new Set(['error', 'failure']);

function normalizeContextName(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeState(value: string): string {
  return value.trim().toLowerCase();
}

export function evaluatePromotionGate(input: {
  statuses: PromotionStatusContext[];
  requiredContexts?: string[];
}): PromotionGateResult {
  const requiredContexts = (input.requiredContexts ?? [...DEFAULT_PROMOTION_CONTEXTS])
    .map((value) => normalizeContextName(value));

  const byContext = new Map<string, string>();
  for (const status of input.statuses) {
    const context = normalizeContextName(status.context);
    const state = normalizeState(status.state);
    if (!context) {
      continue;
    }
    byContext.set(context, state);
  }

  const missingContexts: string[] = [];
  const pendingContexts: string[] = [];
  const failingContexts: string[] = [];

  for (const context of requiredContexts) {
    const state = byContext.get(context);
    if (!state) {
      missingContexts.push(context);
      continue;
    }
    if (SUCCESS_STATES.has(state)) {
      continue;
    }
    if (PENDING_STATES.has(state)) {
      pendingContexts.push(context);
      continue;
    }
    if (FAILING_STATES.has(state)) {
      failingContexts.push(context);
      continue;
    }
    // Unknown state must fail closed.
    pendingContexts.push(`${context} (${state})`);
  }

  const blockReasons: string[] = [];
  if (missingContexts.length > 0) {
    blockReasons.push(`Missing required status contexts: ${missingContexts.join(', ')}`);
  }
  if (pendingContexts.length > 0) {
    blockReasons.push(`Pending required status contexts: ${pendingContexts.join(', ')}`);
  }
  if (failingContexts.length > 0) {
    blockReasons.push(`Failing required status contexts: ${failingContexts.join(', ')}`);
  }

  return {
    ready: blockReasons.length === 0,
    blocked: blockReasons.length > 0,
    requiredContexts,
    missingContexts,
    pendingContexts,
    failingContexts,
    blockReasons,
  };
}
