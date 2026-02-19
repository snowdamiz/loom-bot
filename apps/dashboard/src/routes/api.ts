import { Hono } from 'hono';
import { db, goals, strategies, asc } from '@jarvis/db';

/**
 * STRAT-04, STRAT-05: Strategy engine operator API routes.
 *
 * Routes:
 *   POST /goals       — seed a new goal (with optional strategy creation)
 *   GET  /strategies  — list all strategy rows (plain data, no enrichment)
 *
 * The POST /goals endpoint lets the operator inject a goal that becomes the
 * first strategy the agent will discover and pursue autonomously. The agent's
 * LLM reasoning handles all evaluation — no domain-specific logic here.
 */

const app = new Hono();

/**
 * POST /goals
 *
 * Seed a new operator goal. If isStrategy is true, also creates a strategy
 * row with status='hypothesis' referencing the new goal.
 *
 * Body: { description: string; isStrategy?: boolean }
 * Returns: { goalId: number; strategyId?: number }
 */
app.post('/goals', async (c) => {
  const body = await c.req.json<{ description: string; isStrategy?: boolean }>();
  const { description, isStrategy } = body;

  if (!description || typeof description !== 'string') {
    return c.json({ error: 'description is required' }, 400);
  }

  const [goal] = await db
    .insert(goals)
    .values({
      description,
      source: 'operator-injected',
      priority: 50,
    })
    .returning();

  let strategyId: number | undefined;
  if (isStrategy && goal) {
    const [strategy] = await db
      .insert(strategies)
      .values({
        goalId: goal.id,
        hypothesis: description,
        status: 'hypothesis',
      })
      .returning();
    strategyId = strategy?.id;
  }

  return c.json({ goalId: goal?.id, strategyId });
});

/**
 * GET /strategies
 *
 * List all strategy rows ordered by createdAt ascending.
 * Returns plain strategy data — no P&L enrichment, no financial data.
 * The operator can use this to audit what strategies the agent is pursuing.
 *
 * Returns: Strategy[]
 */
app.get('/strategies', async (c) => {
  const rows = await db.select().from(strategies).orderBy(asc(strategies.createdAt));
  return c.json(rows);
});

export default app;
