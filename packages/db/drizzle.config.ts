import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  // Use compiled schema files so drizzle-kit resolves `.js` relative imports
  // in NodeNext projects the same way runtime code does.
  schema: ['./dist/schema/*.js'],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
