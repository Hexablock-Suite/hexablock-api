# HexaBlock API

## Project Title & Badges

TODO: add the CI badge once the GitHub organization exists.

## Description

TODO: describe the REST backend for users, progress, leaderboards and level definitions of the four HexaBlock games.

## Architecture

TODO: explain the Clean layers (`src/domain`, `src/application`, `src/adapters`, `src/infrastructure`) and the `pnpm arch` rules that guard them.

Draft layer diagram: [docs/architecture/layers.md](docs/architecture/layers.md).

## Generic Engine

TODO: explain how the API stores level definitions for the single generic engine and its variants.

## Design Patterns

TODO: list each pattern with its location and the requirement it serves.

## SOLID Principles

TODO: show one concrete example per principle from this codebase.

## AOP

TODO: describe the cross-cutting aspects, implemented as custom decorators outside `src/application`.

## Getting Started

```bash
fnm use            # reads .node-version (Node 26)
pnpm install       # also installs the git hooks
pnpm start:dev     # http://localhost:3000/health, docs at /docs, JSON at /docs-json
```

The API listens on `PORT` (default `3000`). It starts without a database: no module uses one yet.

For database work, start the local Postgres from `compose.yaml` and point `DATABASE_URL` at it:

```bash
docker compose up -d --wait
export DATABASE_URL=postgres://hexablock:hexablock@localhost:5432/hexablock
pnpm db:generate   # writes a SQL migration into drizzle/ from src/infrastructure/database/schema.ts
pnpm db:migrate    # applies the drizzle/ migrations to DATABASE_URL
docker compose down
```

## Running Tests

```bash
pnpm test          # unit, gate and integration tests, then e2e tests
pnpm test:unit     # unit, gate and integration tests only
pnpm test:e2e      # HTTP end-to-end tests only
pnpm verify        # lint, format:check, typecheck, test, arch, openapi:check (the CI gate)
pnpm openapi:check # fails when openapi/openapi.json differs from the built app
pnpm openapi:export # rewrites openapi/openapi.json after an HTTP change
```

Contract tests verify the client pact against a running API. The CI job `contract` runs them on
every pull request with the pact from the client `main` branch.

```bash
pnpm build && PORT=3000 node dist/main.js &   # start the API
pnpm contract:verify                          # pact from hexablock-app main, API at BACKEND_URL
PACT_FILE=test/fixtures/contract/hexablock-app-hexablock-api.json pnpm contract:verify
```

`BACKEND_URL` defaults to `http://localhost:3000`. A missing pact fails the run.

Integration tests in `test/integration` run on Postgres in memory (PGlite) through
`test/support/test-database.ts`, which applies the `drizzle/` migrations. They need no Docker.

## AI Usage Documentation

TODO: summarize the AI tools used. The full log lives in [AI_USAGE.md](AI_USAGE.md).

## Contributing

TODO: add review rules once `main` is protected. Today: branch from `main` (`feat/<topic>`, `fix/<topic>`), write Conventional Commits in English (commitlint checks them), open a pull request, and merge only when the `verify` job is green.

## License

TODO: confirm the copyright holder. The code is under the [MIT License](LICENSE).
