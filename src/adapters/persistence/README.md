# adapters/persistence

Repository adapters that implement domain ports with Drizzle ORM. Imports `src/application`, `src/domain` and `drizzle-orm`; never `src/infrastructure` and never `@nestjs/*`. The infrastructure binds each adapter to Nest and to the `DATABASE` provider in `src/infrastructure/database`.

`schema.ts` is the Drizzle schema. It lives here because the repositories query its tables and cannot import `src/infrastructure`. `drizzle-kit` reads it to write the migrations in `drizzle/`, and `src/infrastructure/database/connection.ts` passes it to Drizzle.
