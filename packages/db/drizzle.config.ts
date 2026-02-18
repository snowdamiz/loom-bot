import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: [
    './src/schema/agent-state.ts',
    './src/schema/memory-facts.ts',
    './src/schema/tool-calls.ts',
    './src/schema/decision-log.ts',
    './src/schema/planning-cycles.ts',
    './src/schema/ai-calls.ts',
    './src/schema/operating-costs.ts',
    './src/schema/revenue.ts',
    './src/schema/kill-switch-audit.ts',
    './src/schema/goals.ts',
    './src/schema/sub-goals.ts',
  ],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
