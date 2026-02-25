import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { db, agentState, eq } from '@jarvis/db';

/**
 * Chat relay endpoint for the sidebar chat panel.
 * All routes require bearer auth (applied in app.ts at the /api/* level).
 *
 * POST /api/chat         — send a message to the agent
 * GET  /api/chat/history — retrieve last 50 chat messages
 */
const app = new Hono();

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
};

type ChatRequestState = {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  message: string;
  history?: ChatMessage[];
  response?: string;
  error?: string;
  createdAt: string;
  processingStartedAt?: string;
  completedAt?: string;
};

const HISTORY_KEY = 'chat:history';
const MAX_HISTORY = 50;
const CHAT_REQUEST_PREFIX = 'chat:request:';
const MAX_REQUEST_HISTORY = 24;
const CHAT_REQUEST_TIMEOUT_MS = 120_000;
const CHAT_REQUEST_POLL_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseHistory(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (typeof entry !== 'object' || entry === null) return null;
      const row = entry as Partial<ChatMessage>;
      if (row.role !== 'user' && row.role !== 'assistant') return null;
      if (typeof row.content !== 'string' || !row.content.trim()) return null;
      if (typeof row.timestamp !== 'string' || !row.timestamp.trim()) return null;
      return {
        role: row.role,
        content: row.content,
        timestamp: row.timestamp,
      };
    })
    .filter((entry): entry is ChatMessage => entry !== null);
}

async function upsertAgentState(key: string, value: unknown): Promise<void> {
  const rows = await db
    .select()
    .from(agentState)
    .where(eq(agentState.key, key))
    .limit(1);

  if (rows.length > 0) {
    await db
      .update(agentState)
      .set({ value, updatedAt: new Date() })
      .where(eq(agentState.key, key));
    return;
  }

  await db.insert(agentState).values({ key, value });
}

async function loadHistory(): Promise<ChatMessage[]> {
  const rows = await db
    .select()
    .from(agentState)
    .where(eq(agentState.key, HISTORY_KEY))
    .limit(1);

  return parseHistory(rows[0]?.value);
}

async function saveHistory(history: ChatMessage[]): Promise<void> {
  await upsertAgentState(HISTORY_KEY, history.slice(-MAX_HISTORY));
}

function parseRequestState(value: unknown): ChatRequestState | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Partial<ChatRequestState>;

  if (
    typeof row.id !== 'string' ||
    typeof row.message !== 'string' ||
    typeof row.status !== 'string' ||
    typeof row.createdAt !== 'string'
  ) {
    return null;
  }

  if (
    row.status !== 'pending' &&
    row.status !== 'processing' &&
    row.status !== 'completed' &&
    row.status !== 'failed'
  ) {
    return null;
  }

  return {
    id: row.id,
    status: row.status,
    message: row.message,
    history: parseHistory(row.history),
    response: typeof row.response === 'string' ? row.response : undefined,
    error: typeof row.error === 'string' ? row.error : undefined,
    createdAt: row.createdAt,
    processingStartedAt: typeof row.processingStartedAt === 'string' ? row.processingStartedAt : undefined,
    completedAt: typeof row.completedAt === 'string' ? row.completedAt : undefined,
  };
}

async function waitForResponse(requestKey: string): Promise<{
  status: 'completed' | 'failed' | 'timeout';
  response?: string;
  error?: string;
  timestamp?: string;
}> {
  const deadline = Date.now() + CHAT_REQUEST_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const rows = await db
      .select()
      .from(agentState)
      .where(eq(agentState.key, requestKey))
      .limit(1);

    if (rows.length === 0) {
      return {
        status: 'failed',
        error: 'Agent chat request disappeared before completion.',
      };
    }

    const requestState = parseRequestState(rows[0]?.value);
    if (!requestState) {
      return {
        status: 'failed',
        error: 'Agent returned an invalid chat response payload.',
      };
    }

    if (requestState.status === 'completed') {
      return {
        status: 'completed',
        response: requestState.response,
        timestamp: requestState.completedAt,
      };
    }

    if (requestState.status === 'failed') {
      return {
        status: 'failed',
        error: requestState.error ?? 'Agent failed to process the message.',
      };
    }

    await sleep(CHAT_REQUEST_POLL_MS);
  }

  return { status: 'timeout' };
}

/**
 * POST /api/chat
 * Accepts { message: string }. Stores message, relays to the live agent process,
 * waits for completion, and returns the agent reply.
 */
app.post('/', async (c) => {
  let body: { message?: string };
  try {
    body = await c.req.json<{ message?: string }>();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { message } = body;
  if (!message || typeof message !== 'string' || !message.trim()) {
    return c.json({ error: 'message is required' }, 400);
  }

  const timestamp = new Date().toISOString();
  const userMessage: ChatMessage = {
    role: 'user',
    content: message.trim(),
    timestamp,
  };

  const existingHistory = await loadHistory();
  const updatedHistory = [...existingHistory, userMessage].slice(-MAX_HISTORY);
  await saveHistory(updatedHistory);

  // Also store the latest message separately for quick access
  await upsertAgentState('chat:latest_message', { message: message.trim(), timestamp });

  const requestId = randomUUID();
  const requestKey = `${CHAT_REQUEST_PREFIX}${requestId}`;
  const requestPayload: ChatRequestState = {
    id: requestId,
    status: 'pending',
    message: userMessage.content,
    history: updatedHistory.slice(-MAX_REQUEST_HISTORY),
    createdAt: timestamp,
  };

  await db.insert(agentState).values({
    key: requestKey,
    value: requestPayload,
  });

  const result = await waitForResponse(requestKey);

  if (result.status === 'completed') {
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: result.response ?? '',
      timestamp: result.timestamp ?? new Date().toISOString(),
    };

    const finalHistory = [...updatedHistory, assistantMessage].slice(-MAX_HISTORY);
    await saveHistory(finalHistory);

    await db.delete(agentState).where(eq(agentState.key, requestKey));
    return c.json({
      reply: assistantMessage.content,
      timestamp: assistantMessage.timestamp,
    });
  }

  if (result.status === 'failed') {
    await db.delete(agentState).where(eq(agentState.key, requestKey));
    return c.json({ error: result.error ?? 'Agent chat request failed.' }, 500);
  }

  return c.json(
    {
      error: 'Agent is still processing your message. Please try again in a moment.',
      requestId,
    },
    504,
  );
});

/**
 * GET /api/chat/history
 * Returns last 50 chat messages. Returns empty array if no history exists.
 */
app.get('/history', async (c) => {
  const historyRows = await db
    .select()
    .from(agentState)
    .where(eq(agentState.key, HISTORY_KEY))
    .limit(1);

  const history = parseHistory(historyRows[0]?.value);
  return c.json(history);
});

export default app;
