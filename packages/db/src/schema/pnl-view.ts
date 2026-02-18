import { and, gte, lte, sql } from 'drizzle-orm';
import type { DbClient } from '../client.js';
import { aiCalls } from './ai-calls.js';
import { operatingCosts } from './operating-costs.js';
import { revenue } from './revenue.js';

/**
 * COST-04, COST-05: P&L query functions over operating_costs and revenue tables.
 *
 * Implemented as query functions (not a Postgres VIEW) because drizzle-orm
 * does not manage views in db:push. All functions return numeric amounts
 * (not raw strings from numeric columns).
 */

/** Full P&L summary for a time period. */
export interface PnlSummary {
  totalCostsUsd: number;
  totalRevenueUsd: number;
  netPnlUsd: number;
  aiInferenceCostUsd: number;
  periodStart: Date | null;
  periodEnd: Date | null;
}

/**
 * COST-04: Compute P&L summary over the given date range.
 * Queries operating_costs and revenue tables, returns zeroed values on empty tables.
 */
export async function getPnl(
  db: DbClient,
  options?: { since?: Date; until?: Date },
): Promise<PnlSummary> {
  const { since, until } = options ?? {};

  // Build cost query with optional date filters on periodStart/periodEnd
  const costConditions = [];
  if (since) costConditions.push(gte(operatingCosts.periodStart, since));
  if (until) costConditions.push(lte(operatingCosts.periodEnd, until));

  const [costRow] = await db
    .select({
      total: sql<string>`coalesce(sum(${operatingCosts.amountUsd}), '0')`,
      aiTotal: sql<string>`coalesce(sum(case when ${operatingCosts.category} = 'ai_inference' then ${operatingCosts.amountUsd} else 0 end), '0')`,
    })
    .from(operatingCosts)
    .where(costConditions.length > 0 ? and(...costConditions) : undefined);

  // Build revenue query with optional date filter on earnedAt
  const revenueConditions = [];
  if (since) revenueConditions.push(gte(revenue.earnedAt, since));
  if (until) revenueConditions.push(lte(revenue.earnedAt, until));

  const [revenueRow] = await db
    .select({
      total: sql<string>`coalesce(sum(${revenue.amountUsd}), '0')`,
    })
    .from(revenue)
    .where(revenueConditions.length > 0 ? and(...revenueConditions) : undefined);

  const totalCostsUsd = parseFloat(costRow?.total ?? '0');
  const aiInferenceCostUsd = parseFloat(costRow?.aiTotal ?? '0');
  const totalRevenueUsd = parseFloat(revenueRow?.total ?? '0');

  return {
    totalCostsUsd,
    totalRevenueUsd,
    netPnlUsd: totalRevenueUsd - totalCostsUsd,
    aiInferenceCostUsd,
    periodStart: since ?? null,
    periodEnd: until ?? null,
  };
}

/**
 * COST-02: Sum of operating costs, optionally filtered by category.
 * Returns 0 if no rows match.
 */
export async function getOperatingCostTotal(
  db: DbClient,
  category?: string,
): Promise<number> {
  const conditions = category
    ? [sql`${operatingCosts.category} = ${category}`]
    : [];

  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${operatingCosts.amountUsd}), '0')`,
    })
    .from(operatingCosts)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return parseFloat(row?.total ?? '0');
}

/**
 * COST-03: Sum of revenue, optionally filtered by strategyId.
 * Schema only in Phase 2 — returns 0 until strategies populate this table.
 * Returns 0 if no rows match.
 */
export async function getRevenueTotal(
  db: DbClient,
  strategyId?: string,
): Promise<number> {
  const conditions = strategyId
    ? [sql`${revenue.strategyId} = ${strategyId}`]
    : [];

  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${revenue.amountUsd}), '0')`,
    })
    .from(revenue)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return parseFloat(row?.total ?? '0');
}

/**
 * COST-05: Agent's view into its own AI spending.
 * Aggregates ai_calls table: total cost, total calls, breakdown by tier.
 * Queries ai_calls directly — no bridging to operating_costs needed since
 * ai_calls already stores per-call cost data.
 */
export async function getAiSpendSummary(db: DbClient): Promise<{
  totalCostUsd: number;
  totalCalls: number;
  byTier: Record<string, { calls: number; costUsd: number }>;
}> {
  // Aggregate totals
  const [totalsRow] = await db
    .select({
      totalCost: sql<string>`coalesce(sum(${aiCalls.costUsd}), '0')`,
      totalCalls: sql<string>`coalesce(count(*)::text, '0')`,
    })
    .from(aiCalls);

  // Group by tier for breakdown
  const tierRows = await db
    .select({
      tier: aiCalls.tier,
      calls: sql<string>`count(*)::text`,
      costUsd: sql<string>`coalesce(sum(${aiCalls.costUsd}), '0')`,
    })
    .from(aiCalls)
    .groupBy(aiCalls.tier);

  const byTier: Record<string, { calls: number; costUsd: number }> = {};
  for (const row of tierRows) {
    byTier[row.tier] = {
      calls: parseInt(row.calls, 10),
      costUsd: parseFloat(row.costUsd),
    };
  }

  return {
    totalCostUsd: parseFloat(totalsRow?.totalCost ?? '0'),
    totalCalls: parseInt(totalsRow?.totalCalls ?? '0', 10),
    byTier,
  };
}
