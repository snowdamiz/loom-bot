import { Hono } from 'hono';
import { db, agentState, eq } from '@jarvis/db';

/**
 * Chat relay endpoint for the sidebar chat panel.
 * All routes require bearer auth (applied in app.ts at the /api/* level).
 *
 * POST /api/chat         — send a message to the agent
 * GET  /api/chat/history — retrieve last 50 chat messages
 *
 * NOTE: The agent starts in OFF state (kill switch active). This endpoint
 * provides a stub response until the agent is activated by the operator.
 * TODO: Wire to actual agent LLM call when agent is active
 */
const app = new Hono();

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
};

const HISTORY_KEY = 'chat:history';
const MAX_HISTORY = 50;

/**
 * POST /api/chat
 * Accepts { message: string }. Stores the message and returns a stub reply.
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

  // TODO: Wire to actual agent LLM call when agent is active
  const replyTimestamp = new Date().toISOString();
  const assistantMessage: ChatMessage = {
    role: 'assistant',
    content: "I'm currently in setup mode. Once activated, I'll be able to respond to your messages.",
    timestamp: replyTimestamp,
  };

  // Load existing history, append new messages, persist (capped at MAX_HISTORY)
  const historyRows = await db
    .select()
    .from(agentState)
    .where(eq(agentState.key, HISTORY_KEY))
    .limit(1);

  const existingHistory = (historyRows[0]?.value as ChatMessage[] | undefined) ?? [];
  const updatedHistory = [...existingHistory, userMessage, assistantMessage].slice(-MAX_HISTORY);

  if (historyRows.length > 0) {
    await db
      .update(agentState)
      .set({ value: updatedHistory, updatedAt: new Date() })
      .where(eq(agentState.key, HISTORY_KEY));
  } else {
    await db.insert(agentState).values({ key: HISTORY_KEY, value: updatedHistory });
  }

  // Also store the latest message separately for quick access
  const latestRows = await db
    .select()
    .from(agentState)
    .where(eq(agentState.key, 'chat:latest_message'))
    .limit(1);

  if (latestRows.length > 0) {
    await db
      .update(agentState)
      .set({ value: { message: message.trim(), timestamp }, updatedAt: new Date() })
      .where(eq(agentState.key, 'chat:latest_message'));
  } else {
    await db.insert(agentState).values({
      key: 'chat:latest_message',
      value: { message: message.trim(), timestamp },
    });
  }

  return c.json({ reply: assistantMessage.content, timestamp: replyTimestamp });
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

  const history = (historyRows[0]?.value as ChatMessage[] | undefined) ?? [];
  return c.json(history);
});

export default app;
