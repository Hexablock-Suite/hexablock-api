import { defineConfig } from 'drizzle-kit';

// drizzle-kit generates SQL migrations into drizzle/ from the schema.
// `migrate` reads DATABASE_URL; `generate` needs no database.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/infrastructure/database/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
