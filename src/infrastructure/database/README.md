# infrastructure/database

Drizzle ORM on Postgres through the `pg` driver.

- `connection.ts`: reads `DATABASE_URL` and opens a pool. Only the infrastructure reads the environment. It takes the Drizzle schema from `src/adapters/persistence/schema.ts`.
- `database.module.ts`: the Nest provider of the `DATABASE` token.

`AppModule` imports `DatabaseModule` and binds `USER_REPOSITORY` to `DrizzleUserRepository` over `DATABASE`. The app needs `DATABASE_URL` to start, but the pool connects only on the first query. So `/health`, `pnpm openapi:export` and the CI `contract` job start with the example value of `.env.example` and no running database.

Tests run on PGlite in memory through `test/support/test-database.ts`, with the same migrations from `drizzle/`.
