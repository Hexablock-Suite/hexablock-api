# infrastructure/database

Drizzle ORM on Postgres through the `pg` driver.

- `schema.ts`: the Drizzle schema. It has no business tables yet; they arrive with the reviewed requirements.
- `connection.ts`: reads `DATABASE_URL` and opens a pool. Only the infrastructure reads the environment.
- `database.module.ts`: the Nest provider of the `DATABASE` token.

`AppModule` does not import `DatabaseModule` yet. It is wired when the first repository lands in `src/adapters/persistence`. Until then the app and the CI `contract` job start without a database.

Tests run on PGlite in memory through `test/support/test-database.ts`, with the same migrations from `drizzle/`.
