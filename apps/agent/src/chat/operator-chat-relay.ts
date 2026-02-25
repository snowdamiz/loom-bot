import type { ModelRouter, ToolCompletionRequest } from '@jarvis/ai';
import { toolDefinitionsToOpenAI } from '@jarvis/ai';
import { agentState, asc, eq, sql } from '@jarvis/db';
import type { DbClient } from '@jarvis/db';
import type { ToolRegistry } from '@jarvis/tools';
import { invokeWithKillCheck } from '@jarvis/tools';

type ChatCompletionMessageParam = ToolCompletionRequest['messages'][number];
type ChatCompletionTool = ToolCompletionRequest['tools'][number];

type ChatRole = 'user' | 'assistant';

interface PersistedChatMessage {
  role: ChatRole;
  content: string;
  timestamp: string;
}

interface ChatRequestState {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  message: string;
  history?: PersistedChatMessage[];
  response?: string;
  error?: string;
  createdAt: string;
  processingStartedAt?: string;
  completedAt?: string;
}

interface KillCheckable {
  assertActive(): Promise<void>;
}

const CHAT_REQUEST_PREFIX = 'chat:request:';
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const MAX_TURNS = 15;
const MAX_CONTEXT_MESSAGES = 24;

function isChatRole(value: unknown): value is ChatRole {
  return value === 'user' || value === 'assistant';
}

function parseHistory(value: unknown): PersistedChatMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (typeof entry !== 'object' || entry === null) return null;
      const row = entry as Partial<PersistedChatMessage>;
      if (!isChatRole(row.role)) return null;
      if (typeof row.content !== 'string' || !row.content.trim()) return null;
      if (typeof row.timestamp !== 'string' || !row.timestamp.trim()) return null;
      return {
        role: row.role,
        content: row.content,
        timestamp: row.timestamp,
      };
    })
    .filter((entry): entry is PersistedChatMessage => entry !== null);
}

function parseRequest(value: unknown): ChatRequestState | null {
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

function buildSystemPrompt(): string {
  return [
    'You are Jarvis, an autonomous operator-directed agent.',
    'You are currently speaking directly with the human operator in real time.',
    '',
    'Rules:',
    '- Treat operator instructions as high-priority directives.',
    '- Use tools when needed to execute concrete requests immediately.',
    '- If a request implies long-running autonomous work, create or update goals and explain what you changed.',
    '- If blocked by missing credentials, kill switch, or environment constraints, explain exactly what is blocked and the next operator action.',
    '- Keep responses concise, clear, and action-focused.',
  ].join('\n');
}

function buildInitialMessages(request: ChatRequestState): ChatCompletionMessageParam[] {
  const history = parseHistory(request.history).slice(-MAX_CONTEXT_MESSAGES);

  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: buildSystemPrompt(),
    },
  ];

  for (const item of history) {
    messages.push({
      role: item.role,
      content: item.content,
    });
  }

  const hasLatestUserMessage =
    history.length > 0 &&
    history[history.length - 1]?.role === 'user' &&
    history[history.length - 1]?.content === request.message;

  if (!hasLatestUserMessage) {
    messages.push({
      role: 'user',
      content: request.message,
    });
  }

  return messages;
}

function assistantContentToText(content: unknown): string {
  if (typeof content === 'string' && content.trim().length > 0) {
    return content;
  }

  return 'I completed the requested action, but no textual summary was produced.';
}

async function runChatLoop(params: {
  db: DbClient;
  router: ModelRouter;
  registry: ToolRegistry;
  killSwitch: KillCheckable;
  request: ChatRequestState;
}): Promise<string> {
  const { db, router, registry, killSwitch, request } = params;
  const messages = buildInitialMessages(request);
  const tools: ChatCompletionTool[] = toolDefinitionsToOpenAI(registry);

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await router.completeWithTools(messages, 'strong', tools);
    const { message, finishReason } = response;

    messages.push(message as ChatCompletionMessageParam);

    if (finishReason === 'stop') {
      return assistantContentToText(message.content);
    }

    if (finishReason === 'tool_calls' && message.tool_calls && message.tool_calls.length > 0) {
      const toolResultMessages: ChatCompletionMessageParam[] = [];

      for (const toolCall of message.tool_calls) {
        let rawInput: unknown = {};
        try {
          rawInput = JSON.parse(toolCall.function.arguments);
        } catch {
          rawInput = {};
        }

        let toolResultText: string;
        try {
          const result = await invokeWithKillCheck(killSwitch, registry, db, toolCall.function.name, rawInput);
          toolResultText = result.success
            ? JSON.stringify(result.output)
            : `Error: ${result.error ?? 'tool invocation failed'}`;
        } catch (err) {
          toolResultText = `Error: ${err instanceof Error ? err.message : String(err)}`;
        }

        toolResultMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: toolResultText,
        });
      }

      messages.push(...toolResultMessages);
      continue;
    }

    if (finishReason === 'length') {
      return 'I hit the model context length limit while processing that request. Please retry with a narrower instruction.';
    }

    if (finishReason === 'content_filter') {
      return 'The model content filter blocked this response. Please rephrase the request.';
    }

    return `I could not complete the response because of an unexpected finish reason: ${finishReason}.`;
  }

  return `I reached the maximum reasoning turns (${MAX_TURNS}) while processing your request. Please retry with a narrower instruction.`;
}

async function processNextRequest(params: {
  db: DbClient;
  router: ModelRouter;
  registry: ToolRegistry;
  killSwitch: KillCheckable;
}): Promise<void> {
  const { db, router, registry, killSwitch } = params;

  const rows = await db
    .select()
    .from(agentState)
    .where(sql`${agentState.key} LIKE ${`${CHAT_REQUEST_PREFIX}%`}`)
    .orderBy(asc(agentState.updatedAt))
    .limit(50);

  const pending = rows.find((row) => parseRequest(row.value)?.status === 'pending');
  if (!pending) return;

  const parsed = parseRequest(pending.value);
  if (!parsed) {
    await db
      .update(agentState)
      .set({
        value: {
          status: 'failed',
          error: 'Invalid chat request payload.',
          completedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(eq(agentState.id, pending.id));
    return;
  }

  const processingState: ChatRequestState = {
    ...parsed,
    status: 'processing',
    processingStartedAt: new Date().toISOString(),
    error: undefined,
  };

  await db
    .update(agentState)
    .set({ value: processingState, updatedAt: new Date() })
    .where(eq(agentState.id, pending.id));

  try {
    const responseText = await runChatLoop({
      db,
      router,
      registry,
      killSwitch,
      request: processingState,
    });

    const completedState: ChatRequestState = {
      ...processingState,
      status: 'completed',
      response: responseText,
      completedAt: new Date().toISOString(),
      error: undefined,
    };

    await db
      .update(agentState)
      .set({ value: completedState, updatedAt: new Date() })
      .where(eq(agentState.id, pending.id));
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : String(err);
    const friendlyMessage = rawMessage.includes('Kill switch is active')
      ? 'Kill switch is active. Resume the agent from the dashboard before using live chat.'
      : rawMessage;

    const failedState: ChatRequestState = {
      ...processingState,
      status: 'failed',
      error: friendlyMessage,
      completedAt: new Date().toISOString(),
    };

    await db
      .update(agentState)
      .set({ value: failedState, updatedAt: new Date() })
      .where(eq(agentState.id, pending.id));
  }
}

export function startOperatorChatRelay(params: {
  db: DbClient;
  router: ModelRouter;
  registry: ToolRegistry;
  killSwitch: KillCheckable;
  pollIntervalMs?: number;
}): ReturnType<typeof setInterval> {
  const { db, router, registry, killSwitch, pollIntervalMs = DEFAULT_POLL_INTERVAL_MS } = params;
  let processing = false;

  const tick = async (): Promise<void> => {
    if (processing) return;
    processing = true;
    try {
      await processNextRequest({ db, router, registry, killSwitch });
    } catch (err) {
      process.stderr.write(
        `[chat-relay] Processing error: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    } finally {
      processing = false;
    }
  };

  void tick();
  const handle = setInterval(() => {
    void tick();
  }, pollIntervalMs);

  process.stderr.write(`[chat-relay] Started. Interval: ${pollIntervalMs}ms.\n`);
  return handle;
}
