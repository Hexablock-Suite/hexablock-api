# drizzle

SQL migrations that `pnpm db:generate` writes from `src/infrastructure/database/schema.ts`. Never edit a committed migration; generate a new one. `pnpm db:migrate` applies them to `DATABASE_URL`, and `test/support/test-database.ts` applies them to the in-memory test database.
