import { Hono } from 'hono';
import {
  db,
  toolCalls,
  decisionLog,
  walletTransactions,
  planningCycles,
  desc,
  lt,
  sql,
} from '@jarvis/db';

/**
 * DASH-06: Activity feed endpoint.
 * Returns cursor-paginated activity entries from various log tables.
 */
const app = new Hono();

app.get('/', async (c) => {
  const cursorParam = c.req.query('cursor');
  const limitParam = c.req.query('limit');
  const type = c.req.query('type') as 'tool_calls' | 'decisions' | 'wallet' | 'planning' | undefined;
  const search = c.req.query('search');

  const cursor = cursorParam ? parseInt(cursorParam, 10) : undefined;
  const limit = Math.min(parseInt(limitParam ?? '50', 10) || 50, 100);

  let rows: unknown[];
  let nextCursor: number | null = null;

  if (type === 'decisions') {
    // Query decision log
    const query = db
      .select()
      .from(decisionLog)
      .orderBy(desc(decisionLog.id))
      .limit(limit + 1);

    // Apply cursor
    const results = cursor
      ? await db
          .select()
          .from(decisionLog)
          .where(
            search
              ? sql`${decisionLog.id} < ${cursor} AND ${decisionLog.decision} ILIKE ${'%' + search + '%'}`
              : lt(decisionLog.id, cursor),
          )
          .orderBy(desc(decisionLog.id))
          .limit(limit + 1)
      : search
        ? await db
            .select()
            .from(decisionLog)
            .where(sql`${decisionLog.decision} ILIKE ${'%' + search + '%'}`)
            .orderBy(desc(decisionLog.id))
            .limit(limit + 1)
        : await query;

    if (results.length > limit) {
      const last = results[limit - 1];
      nextCursor = last ? last.id : null;
      rows = results.slice(0, limit);
    } else {
      rows = results;
    }
  } else if (type === 'wallet') {
    // Query wallet transactions
    const results = cursor
      ? await db
          .select()
          .from(walletTransactions)
          .where(
            search
              ? sql`${walletTransactions.id} < ${cursor} AND ${walletTransactions.purpose} ILIKE ${'%' + search + '%'}`
              : lt(walletTransactions.id, cursor),
          )
          .orderBy(desc(walletTransactions.id))
          .limit(limit + 1)
      : search
        ? await db
            .select()
            .from(walletTransactions)
            .where(sql`${walletTransactions.purpose} ILIKE ${'%' + search + '%'}`)
            .orderBy(desc(walletTransactions.id))
            .limit(limit + 1)
        : await db
            .select()
            .from(walletTransactions)
            .orderBy(desc(walletTransactions.id))
            .limit(limit + 1);

    if (results.length > limit) {
      const last = results[limit - 1];
      nextCursor = last ? last.id : null;
      rows = results.slice(0, limit);
    } else {
      rows = results;
    }
  } else if (type === 'planning') {
    // Query planning cycles
    const results = cursor
      ? await db
          .select()
          .from(planningCycles)
          .where(lt(planningCycles.id, cursor))
          .orderBy(desc(planningCycles.id))
          .limit(limit + 1)
      : await db
          .select()
          .from(planningCycles)
          .orderBy(desc(planningCycles.id))
          .limit(limit + 1);

    if (results.length > limit) {
      const last = results[limit - 1];
      nextCursor = last ? last.id : null;
      rows = results.slice(0, limit);
    } else {
      rows = results;
    }
  } else {
    // Default: query tool calls
    const results = cursor
      ? await db
          .select()
          .from(toolCalls)
          .where(
            search
              ? sql`${toolCalls.id} < ${cursor} AND ${toolCalls.toolName} ILIKE ${'%' + search + '%'}`
              : lt(toolCalls.id, cursor),
          )
          .orderBy(desc(toolCalls.id))
          .limit(limit + 1)
      : search
        ? await db
            .select()
            .from(toolCalls)
            .where(sql`${toolCalls.toolName} ILIKE ${'%' + search + '%'}`)
            .orderBy(desc(toolCalls.id))
            .limit(limit + 1)
        : await db
            .select()
            .from(toolCalls)
            .orderBy(desc(toolCalls.id))
            .limit(limit + 1);

    if (results.length > limit) {
      const last = results[limit - 1];
      nextCursor = last ? last.id : null;
      rows = results.slice(0, limit);
    } else {
      rows = results;
    }
  }

  return c.json({ rows, nextCursor, type: type ?? 'tool_calls' });
});

export default app;
