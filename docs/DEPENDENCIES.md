# Dependencies

This file explains every entry of the `dependencies` and the `devDependencies` maps of [`package.json`](../package.json) with one truthful reason. The gate [`test/gates/dependencies.gate.spec.ts`](../test/gates/dependencies.gate.spec.ts) fails when `package.json` lists a package that this file does not explain: a package counts as explained only when a list-item line here starts with its backticked name and continues with a non-empty reason. The check is one-way: a line here about a package that `package.json` no longer lists does not fail anything, and a prose mention of a tool does not explain it.

## Dependencies

- `@nestjs/common` — the Nest framework surface: the decorators, controllers, guards, pipes and `HttpException` types used across `src/adapters/http`, `src/infrastructure` and the wiring of the modules, and the logger that `NestLogger` in `src/adapters/logging` writes through.
- `@nestjs/core` — the Nest runtime: `NestFactory` bootstraps the app in `src/main.ts` and `scripts/openapi/export.js`, and `APP_FILTER` binds the `HttpErrorFilter` in `src/infrastructure/app.module.ts`.
- `@nestjs/jwt` — token issuing and verification: `JwtTokenIssuer` in `src/adapters/jwt` and `auth-config.ts` in `src/infrastructure/auth` build on its `JwtService`, and the e2e specs sign test tokens with it.
- `@nestjs/platform-express` — the HTTP adapter that Nest resolves implicitly at `NestFactory.create(AppModule)`; no source file imports it by design, the platform is chosen at bootstrap.
- `@nestjs/swagger` — `ApiProperty` on every HTTP DTO, plus the OpenAPI document and the Swagger UI built in `src/infrastructure/http-app.ts` with `DocumentBuilder` and `SwaggerModule`.
- `drizzle-orm` — the ORM of the persistence adapters (`src/adapters/persistence`, the one non-Nest dependency rule R-persistence-no-nest allows there): the schema, the queries and the connection.
- `pg` — the production PostgreSQL driver that `src/infrastructure/database/connection.ts` opens the pool with; the tests run on PGlite instead (rule R-database-harness).
- `reflect-metadata` — decorator metadata that Nest reads at run time (`emitDecoratorMetadata` in `tsconfig.json`); the peer requirement of `@nestjs/*`.
- `rxjs` — the peer requirement of `@nestjs/*`: the Nest internals run on its Observables and Subjects.

## devDependencies

- `@commitlint/cli` — the commit-message hook and the CI commitlint run; the pin of the commit rules that `test/gates/commit-message.gate.spec.ts` and the ci-contract gate check.
- `@commitlint/config-conventional` — the Conventional Commits preset that `commitlint.config.cjs` extends.
- `@electric-sql/pglite` — the in-memory Postgres that `test/support/test-database.ts` runs every repository test on, so no test touches a shared Postgres (rule R-database-harness).
- `@nestjs/cli` — the `nest build`, `nest start` and `nest start --watch` scripts of `package.json`.
- `@nestjs/schematics` — the collection that `nest-cli.json` names for `nest generate`.
- `@nestjs/testing` — the `Test` module that bootstraps the test app in `test/support/http/test-app.ts` and the gate specs.
- `@pact-foundation/pact` — the `Verifier` of `scripts/contract/verify-provider.js`, the provider side of the contract job in CI (rule R-contract).
- `@types/express` — the request and response types that the `@nestjs/platform-express` typings consume indirectly; no source file imports `express` directly.
- `@types/node` — the Node types that the compiler loads through the `types` entry of `tsconfig.json` (next to `vitest/globals`).
- `@types/pg` — the types of the `pg` import in `src/infrastructure/database/connection.ts` and the tests.
- `@types/supertest` — the types of the `supertest` calls in the e2e specs and `test/support/http`.
- `@vitest/coverage-v8` — the V8 coverage provider that the `test:cov` script resolves.
- `dependency-cruiser` — the layer rules of `.dependency-cruiser.cjs`, enforced by the `arch` script, `test/support/depcruise.ts` and the architecture gate.
- `drizzle-kit` — the `db:generate` and `db:migrate` scripts and `drizzle.config.ts`: it writes and applies the migrations of `drizzle/`.
- `source-map-support` — part of the Nest scaffold's dependency set; no source file or test imports it today. Keeping or removing it is a separate decision, recorded on [#84](https://github.com/Hexablock-Suite/hexablock-api/issues/84).
- `supertest` — the HTTP requests of every e2e spec and of `test/support/http`.
- `typescript` — the compiler of the `typecheck` script (`tsc --noEmit`), of `nest build` and of the type-aware lint rules.
- `vite-plus` — the `defineConfig` of `vite.config.ts` and the `vp` formatter and linter that the `format`, `format:check` and `lint` scripts and the git hooks run.
- `vitest` — the test runner of the unit, gate and e2e configs, and the `vitest/globals` type set of `tsconfig.json`.
