import type { Strategy } from '@jarvis/db';

/**
 * STRAT-01, STRAT-02: Domain-agnostic portfolio context prompt builder.
 *
 * Builds a compact, domain-agnostic portfolio summary for injection into
 * every sub-goal system prompt. Intentionally minimal — no financial data,
 * no domain-specific metrics, no kill triggers.
 *
 * The agent uses its own LLM reasoning and existing tools (db, http, browser,
 * shell) to evaluate strategies, research opportunities, and make all decisions.
 *
 * Kept under ~500 tokens to avoid context window overflow.
 */

const MAX_HYPOTHESIS_LENGTH = 80;

/**
 * Truncate a string to maxLen characters, appending '…' if truncated.
 */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '…';
}

/**
 * Format a Date (or ISO string) as a short YYYY-MM-DD string.
 */
function formatDate(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().slice(0, 10);
}

/**
 * Build a compact, domain-agnostic portfolio context prompt from the given strategies.
 *
 * If the strategies array is empty, returns a prompt directing the agent to
 * discover opportunities. If strategies exist, lists each one with:
 *   - 1-indexed position
 *   - Status (HYPOTHESIS, TESTING, ACTIVE, PAUSED, KILLED, COMPLETED)
 *   - Truncated hypothesis (80 chars max)
 *   - Goal ID and creation date
 *   - lastTransitionReason for paused/killed strategies only
 *
 * No financial data, no domain-specific guidance. The agent queries the db
 * tool for full strategy details whenever its LLM reasoning requires them.
 *
 * @param strategies - Strategy rows from the database
 * @returns Domain-agnostic portfolio context string for injection into system prompts
 */
export function buildPortfolioContextPrompt(strategies: Strategy[]): string {
  if (strategies.length === 0) {
    return [
      'ACTIVE STRATEGIES: None.',
      'You have no active strategies. Analyze your goal and discover opportunities to pursue it.',
      'Use your available tools (web research, browser, db queries) to gather information and form hypotheses.',
    ].join('\n');
  }

  const lines: string[] = ['ACTIVE STRATEGIES:'];

  for (let i = 0; i < strategies.length; i++) {
    const s = strategies[i]!;
    const status = (s.status ?? 'unknown').toUpperCase();
    const hypothesis = truncate(s.hypothesis ?? '', MAX_HYPOTHESIS_LENGTH);
    const since = formatDate(s.createdAt);

    let line = `  [${i + 1}] ${status}: "${hypothesis}"`;
    line += `\n      Goal #${s.goalId} | Since: ${since}`;

    // Show transition reason for non-normal states
    if (
      s.lastTransitionReason &&
      (s.status === 'paused' || s.status === 'killed')
    ) {
      line += ` | Reason: ${truncate(s.lastTransitionReason, 80)}`;
    }

    lines.push(line);
  }

  lines.push('');
  lines.push(
    'You can use the db tool to query detailed information about any strategy.',
  );
  lines.push(
    'Evaluate your strategies, scale what works, kill what doesn\'t, and discover new approaches.',
  );

  return lines.join('\n');
}
