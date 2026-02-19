import { Hono } from 'hono';
import { db, getPnl, getAiSpendSummary, getRevenueTotal } from '@jarvis/db';

/**
 * DASH-05: P&L data endpoint.
 * Returns P&L summary and AI spend data.
 */
const app = new Hono();

app.get('/', async (c) => {
  const sinceParam = c.req.query('since');
  const since = sinceParam ? new Date(sinceParam) : undefined;

  const [pnl, aiSpend] = await Promise.all([
    getPnl(db, { since }),
    getAiSpendSummary(db),
  ]);

  return c.json({ pnl, aiSpend });
});

app.get('/revenue', async (c) => {
  const strategyId = c.req.query('strategyId');

  const total = await getRevenueTotal(db, strategyId);

  return c.json({ total, strategyId: strategyId ?? null });
});

export default app;
