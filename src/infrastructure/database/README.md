# infrastructure/database

Drizzle ORM on Postgres through the `pg` driver.

- `connection.ts`: reads `DATABASE_URL` and opens a pool. Only the infrastructure reads the environment. It takes the Drizzle schema from `src/adapters/persistence/schema.ts`. The pool registers one error listener: an idle client that loses its connection emits `'error'` on the pool, and without a listener that event ends the process. The listener writes one entry with the event name `database_pool_error`, the error name and the error code, and it never writes the message of the error (#173). It does not make a failed query pass and does not keep the database reachable.
- `database.module.ts`: the Nest provider of the `DATABASE` token. Its `onApplicationShutdown` ends the pool, and `main.ts` enables the Nest shutdown hooks, so SIGTERM and SIGINT close the HTTP server first and the pool last (#173).

`AppModule` imports `DatabaseModule` and binds `USER_REPOSITORY` to `DrizzleUserRepository` over `DATABASE`. The app needs `DATABASE_URL` to start, but the pool connects only on the first query. So `/v1/health`, `pnpm openapi:export` and the CI `contract` job start with the example value of `.env.example` and no running database.

Tests run on PGlite in memory through `test/support/test-database.ts`, with the same migrations from `drizzle/`.
