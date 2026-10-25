# adapters/persistence

Repository adapters that implement domain ports with Drizzle ORM. Imports `src/application`, `src/domain` and `drizzle-orm`; never `src/infrastructure` and never `@nestjs/*`. The infrastructure binds each adapter to Nest and to the `DATABASE` provider in `src/infrastructure/database`.
