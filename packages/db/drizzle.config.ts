import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: [
    './src/schema/agent-state.ts',
    './src/schema/memory-facts.ts',
    './src/schema/tool-calls.ts',
    './src/schema/decision-log.ts',
    './src/schema/planning-cycles.ts',
  ],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
