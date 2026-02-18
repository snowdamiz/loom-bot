import type { ModelRouter } from '@jarvis/ai';

/**
 * LOOP-02, LOOP-03: LLM planning prompts for goal decomposition and sub-goal generation.
 *
 * planGoalDecomposition: Decomposes a high-level goal into a prioritized list of sub-goals
 * via LLM, returning structured JSON that GoalManager inserts into the sub_goals table.
 *
 * planNextAction: Produces a reasoning/plan text that the agent loop uses as system context
 * when executing a specific sub-goal.
 */

/**
 * Sub-goal descriptor returned by planGoalDecomposition.
 * dependsOn uses 0-based indices into the returned array (resolved to DB IDs after insert).
 */
export interface SubGoalDescriptor {
  description: string;
  dependsOn: number[];
  priority: number;
}

/**
 * Ask the LLM to decompose a high-level goal into concrete, ordered sub-goals.
 *
 * Uses 'strong' tier — goal decomposition requires high reasoning capability.
 * dependsOn entries are 0-based indices into the returned array.
 *
 * IMPORTANT: The prompt explicitly warns against over-decomposition (per Anthropic research
 * pitfall — spawning overhead must not exceed the value of parallelism).
 *
 * @param router           - ModelRouter for LLM completions
 * @param goalDescription  - Free-text description of the top-level goal
 * @param availableTools   - List of tools available for sub-goal execution
 * @returns Ordered array of sub-goal descriptors
 */
export async function planGoalDecomposition(
  router: ModelRouter,
  goalDescription: string,
  availableTools: Array<{ name: string; description: string }>,
): Promise<SubGoalDescriptor[]> {
  const toolList = availableTools
    .map((t) => `  - ${t.name}: ${t.description}`)
    .join('\n');

  const systemPrompt = `You are an autonomous AI agent planning system. Your task is to decompose a high-level goal into a minimal, ordered list of concrete sub-goals.

GOAL TO DECOMPOSE:
${goalDescription}

AVAILABLE TOOLS:
${toolList || '  (none)'}

DECOMPOSITION RULES:
1. Keep sub-goals concrete and actionable — each sub-goal should be completable by invoking one or more tools.
2. AVOID OVER-DECOMPOSITION: Only create sub-goals that have meaningful execution weight. Do NOT split trivial operations into multiple sub-goals. Spawning overhead is real — each sub-goal carries planning and context cost.
3. Use dependsOn to express ordering constraints. dependsOn contains 0-based indices into this array (e.g., if sub-goal 2 must run after sub-goals 0 and 1, set dependsOn: [0, 1]).
4. Priority 0 = highest priority. Assign priorities 0, 10, 20... in execution order.
5. Aim for 2–8 sub-goals for typical goals. Single-step goals should have exactly 1 sub-goal.
6. Do NOT create sub-goals for monitoring or reporting unless the goal explicitly requires it.

Respond with ONLY a valid JSON array. No explanation, no markdown fences, just the raw JSON array:
[
  {
    "description": "...",
    "dependsOn": [],
    "priority": 0
  }
]`;

  const response = await router.complete(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Decompose the goal into sub-goals now.' },
    ],
    'strong',
  );

  // Parse and validate the JSON response
  let raw: unknown;
  try {
    // Strip markdown code fences if the LLM returned them despite instructions
    const text = response.content.trim().replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '');
    raw = JSON.parse(text);
  } catch {
    throw new Error(
      `planGoalDecomposition: LLM returned invalid JSON: ${response.content.slice(0, 200)}`,
    );
  }

  if (!Array.isArray(raw)) {
    throw new Error(
      `planGoalDecomposition: Expected JSON array, got: ${typeof raw}`,
    );
  }

  const subGoals: SubGoalDescriptor[] = raw.map((item: unknown, idx: number) => {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`planGoalDecomposition: sub-goal[${idx}] is not an object`);
    }
    const obj = item as Record<string, unknown>;

    if (typeof obj.description !== 'string' || !obj.description) {
      throw new Error(`planGoalDecomposition: sub-goal[${idx}] missing description`);
    }

    const dependsOn = Array.isArray(obj.dependsOn)
      ? (obj.dependsOn as unknown[]).map((d, di) => {
          if (typeof d !== 'number') {
            throw new Error(`planGoalDecomposition: sub-goal[${idx}].dependsOn[${di}] must be a number`);
          }
          return d;
        })
      : [];

    const priority = typeof obj.priority === 'number' ? obj.priority : idx * 10;

    return { description: obj.description, dependsOn, priority };
  });

  return subGoals;
}

/**
 * Ask the LLM for a concise action plan for the next sub-goal execution.
 *
 * Returns free-text reasoning/plan used as system context in the agent loop.
 * Uses 'mid' tier — action planning is mid-complexity.
 *
 * @param router              - ModelRouter for LLM completions
 * @param subGoalDescription  - What this sub-goal must accomplish
 * @param previousResults     - Outcomes from previously completed sub-goals
 * @param availableTools      - Tools available for use
 * @returns Plan text to inject into the agent loop as system context
 */
export async function planNextAction(
  router: ModelRouter,
  subGoalDescription: string,
  previousResults: unknown[],
  availableTools: Array<{ name: string; description: string }>,
): Promise<string> {
  const toolList = availableTools
    .map((t) => `  - ${t.name}: ${t.description}`)
    .join('\n');

  const contextSection =
    previousResults.length > 0
      ? `PREVIOUS RESULTS (from completed sub-goals):\n${previousResults
          .map((r, i) => `  [${i}]: ${JSON.stringify(r).slice(0, 500)}`)
          .join('\n')}`
      : 'PREVIOUS RESULTS: None (first sub-goal)';

  const systemPrompt = `You are an autonomous AI agent. Plan the execution of the following sub-goal.

SUB-GOAL: ${subGoalDescription}

${contextSection}

AVAILABLE TOOLS:
${toolList || '  (none)'}

Provide a concise execution plan (3–5 sentences) describing:
1. Which tool(s) to use and in what order
2. What inputs to provide
3. What success looks like

Keep it focused and actionable. This plan will be injected as system context for the tool-calling loop.`;

  const response = await router.complete(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'What is the execution plan for this sub-goal?' },
    ],
    'mid',
  );

  return response.content;
}
