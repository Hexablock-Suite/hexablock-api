# drizzle

SQL migrations that `pnpm db:generate` writes from `src/adapters/persistence/schema.ts`. Never edit a committed migration; generate a new one. `pnpm db:migrate` applies them to `DATABASE_URL`, and `test/support/test-database.ts` applies them to the in-memory test database.

`0003_username_key.sql` fails on a database that already holds a user. To bring a local compose database created before it that holds a user to the current schema, reset that database as [README.md](../README.md#getting-started) describes. The reset deletes every row of the local database.
