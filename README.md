<!-- The banner comes from brand/tools/profile-assets/gen.py --repo hexablock-api in Hexablock-Suite/.github. Regenerate it there; do not edit the SVG files by hand. -->
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/banner-dark.svg">
  <img src="docs/assets/banner-light.svg" alt="HexaBlock API. REST backend: users, progress, leaderboards and level definitions, with Drizzle and OpenAPI docs." width="100%">
</picture>

# HexaBlock API

## Project Title & Badges

[![hexablock-api CI](https://img.shields.io/github/actions/workflow/status/Hexablock-Suite/hexablock-api/ci.yml?branch=main&style=flat-square&label=CI&logo=githubactions&logoColor=white&labelColor=262830)](https://github.com/Hexablock-Suite/hexablock-api/actions/workflows/ci.yml)

REST backend: users, progress, leaderboards and level definitions, with Drizzle and OpenAPI docs.

## Description

HexaBlock API is the REST backend of the four HexaBlock games. It serves the client app
(`hexablock-app`) with the functional requirements of statement §5.2, listed in
[docs/REQUIREMENTS.md](docs/REQUIREMENTS.md):

- **Accounts (API-FR-01):** sign-up and sign-in with JWT.
- **Progress (API-FR-02):** progress sync, one entry per user and per `gameId`.
- **Leaderboard (API-FR-03):** a global leaderboard per `gameId`, and a per-level leaderboard for
  Fit and Sort. What orders the per-level leaderboard is still open (DS-4).
- **Levels (API-FR-04):** read and update the level definitions of Fit and Sort, so new levels
  reach players without an app update.
- **API docs (API-FR-05):** Swagger at `/docs` and the committed `openapi/openapi.json`.
- **Errors (API-FR-06):** one error body shape for every HTTP error.

Today `src/` holds the health endpoint, the `Clock` port and its adapter, the database
connection, and the `HttpErrorFilter` that gives every HTTP error the `ErrorDto` body. The rest is designed in [docs/architecture/](docs/architecture/) and is not built yet.

## Architecture

The API follows Clean Architecture with four layers (statement §3.4). Every source dependency
points toward the domain.

![The four Clean layers as concentric rings: the entities in the centre, then the use cases and their ports, the interface adapters, and the frameworks and drivers outside](docs/architecture/layers/views/layers-1-rings.png)

| Layer                      | Folder                                          | What lives there                                                               |
| -------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------ |
| 1. Domain (entities)       | `src/domain`                                    | Entities and value objects, such as `PlayerProgress` and `LevelDefinition`.    |
| 2. Application (use cases) | `src/application`                               | Use cases, their input ports and the output ports that the adapters implement. |
| 3. Interface adapters      | `src/adapters/http`, `src/adapters/persistence` | Nest controllers, DTOs and mappers; Drizzle repositories and the schema.       |
| 4. Frameworks and drivers  | `src/infrastructure`                            | Nest modules, the database connection and system adapters such as the clock.   |

The table shows the design. Most of these pieces are not code yet; their code starts in Sprint 1.

- **Ports live in the application layer (Q10).** For example, the `Clock` port is in
  [src/application/ports/clock.ts](src/application/ports/clock.ts). The domain never imports a
  port: a use case reads the instant and passes it to the domain as a parameter.
- **Adapters live in layers 3 and 4.** [SystemClock](src/infrastructure/clock/system-clock.ts)
  implements `Clock`. The planned Drizzle repositories implement the repository ports.
- **`AppModule` is the composition root.** [src/infrastructure/app.module.ts](src/infrastructure/app.module.ts)
  binds each port to one adapter. `src/main.ts` only starts the app.
- **A gate enforces the layers.** `pnpm arch` runs dependency-cruiser with the rules in
  [.dependency-cruiser.cjs](.dependency-cruiser.cjs): `domain-imports-only-domain`,
  `application-imports-only-domain`, `adapters-never-import-infrastructure` and
  `persistence-adapters-never-import-nest`. `test/gates/architecture.gate.spec.ts` tests them.

Full layer diagram and the place of each piece: [docs/architecture/layers.md](docs/architecture/layers.md).
Classes per layer: [docs/architecture/classes.md](docs/architecture/classes.md). Extension points:
[docs/architecture/extensibility.md](docs/architecture/extensibility.md).
How one request crosses the layers, as a class view and a sequence diagram:
[docs/architecture/flows.md](docs/architecture/flows.md).

## Generic Engine

The API has no game engine; the generic engine lives in the app. The API stores the level
definitions that the engine plays, with generic types (decision D6):

- **`LevelDefinition<TSection>`** holds the common part (`gameId`, `levelId`, `order`, `version`,
  `topology`) and one typed section per `gameId` (DS-6). `TSection` is `FitSection` or
  `SortSection`. Lines and Merge have no level files.
- **`LevelValidator<TSection>`** checks the shape and the rules of one section, for example the
  A5 check of a Fit level. `LevelValidators` registers one validator per `gameId`.
- **`UseCase<TRequest, TResponse>`** is the one generic input port. Every use case binds it, so
  one aspect class wraps any use case.
- **`Result<T, E>`** carries an expected failure as a value, never as an exception.

These types are the design. Their code starts in Sprint 1.

A new variant with level files adds a section type, a validator and one entry in the composition
root. No existing class changes. See [docs/architecture/extensibility.md](docs/architecture/extensibility.md)
and views 1.2 and 2.3 of [docs/architecture/classes.md](docs/architecture/classes.md).

## Design Patterns

The patterns come from the backend class diagram. Most classes are not built yet, so each link
points to the design doc; links move to the source files as code lands.

| Pattern                            | Classes                                                                           | Quality it protects                                 | Reason                                                                                                 | Link                                                                                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strategy                           | `LevelValidator`, `FitLevelValidator`, `SortLevelValidator`                       | Extensibility: a new variant adds one validator     | Each `gameId` with levels registers the validator that checks its section (§3.3, DS-6, API-FR-04, A5). | [classes.md, view 1.2](docs/architecture/classes.md#view-12-the-level-schema)                                                                        |
| Decorator                          | `UseCaseAspect`, `LoggingAspect`, `TimingAspect`                                  | Separation: no cross-cutting code inside a use case | The aspects of §3.5 wrap any use case and add no code to it (API-NFR-07, A2). Q12 decides their layer. | [classes.md, view 2.1](docs/architecture/classes.md#view-21-the-use-case-contract-and-its-aspects)                                                   |
| Adapter                            | The Drizzle repositories; `SystemClock`, `ScryptPasswordHasher`, `JwtTokenIssuer` | Replaceability: a new database engine or driver     | A new database engine means new adapters, and the use cases do not change (§3.3, §3.4, §8).            | [classes.md, views 3.1, 3.2, 3.4](docs/architecture/classes.md#part-3-adapters-and-drivers); [SystemClock](src/infrastructure/clock/system-clock.ts) |
| Singleton (single-scope injection) | `AppModule` and its providers                                                     | Consistency: one shared instance of each adapter    | One instance of each adapter for the whole API (§3.3).                                                 | [classes.md, view 3.4](docs/architecture/classes.md#view-34-wiring); [AppModule](src/infrastructure/app.module.ts)                                   |

Abstract Factory is also mandatory in §3.3. The app holds it, one factory per variant. The API
does not use it: a variant has one product, its level validator (decision 8 of `classes.md`).

## SOLID Principles

The design docs give the decisions below. Each one shows one principle. Only the `Clock` example
exists in code today; the others link the design doc until their code lands.

- **Single responsibility:** `ProgressDtoMapper` and `LevelDtoMapper` translate between DTOs and
  entities, so a controller holds no translation code (decision 12,
  [view 3.5](docs/architecture/classes.md#view-35-http-mappers)).
- **Open/closed:** a new variant with level files adds a `LevelValidator` and one entry in the
  composition root, and changes no existing class (decision 5,
  [extensibility.md](docs/architecture/extensibility.md#extension-points)).
- **Liskov substitution:** each aspect implements the same input port as the use case it wraps,
  so a controller takes either one (layers.md, "Where each piece lives";
  [view 2.1](docs/architecture/classes.md#view-21-the-use-case-contract-and-its-aspects)).
- **Interface segregation:** each use case has its own input port, such as `SyncProgress` or
  `GetLevels`. A controller depends only on the ports it calls
  ([layers.md](docs/architecture/layers.md#where-each-piece-lives)).
- **Dependency inversion:** the application owns the `Clock` port in
  [src/application/ports/clock.ts](src/application/ports/clock.ts), and
  [SystemClock](src/infrastructure/clock/system-clock.ts) in the infrastructure implements it.

## AOP

The cross-cutting aspects are logging and timing (§3.5, API-NFR-07). They wrap use cases as
decorators: `UseCaseAspect` implements the input port, and `LoggingAspect` and `TimingAspect`
extend it ([view 2.1](docs/architecture/classes.md#view-21-the-use-case-contract-and-its-aspects)).
They are custom decorators or proxies, never Nest interceptors, because `src/application`
imports no package (rule R-application-pure).

Where the aspects live is still open: **Q12** in [layers.md](docs/architecture/layers.md#open-questions-for-the-professor).
The draft puts them in `src/infrastructure`, where they call a logging package directly, so there
is no `Logger` port. If Q12 moves them to `src/application`, they need a `Logger` port there.
The aspects are not built yet.

## Getting Started

You need Node 26 (through [fnm](https://github.com/Schniz/fnm)), pnpm and, for database work,
Docker.

```bash
fnm use            # reads .node-version (Node 26)
pnpm install       # also installs the git hooks
pnpm start:dev     # http://localhost:3000/health, docs at /docs, JSON at /docs-json
```

The API reads `PORT` (default `3000`), `DATABASE_URL` and `JWT_SECRET` from the environment, and does not
start without the last two. `.env.example` lists them. Copy it to `.env`, set `JWT_SECRET` to a random
value of at least 32 characters, and load it before you start the API:

```bash
cp .env.example .env   # .gitignore keeps .env out of git
set -a && . ./.env && set +a
pnpm start:dev
```

The pool connects on the first query, so `/health` answers without a running database.
Sign-up and sign-in (`POST /auth/register`, `POST /auth/login`) need the database and its migrations.

For database work, start the local Postgres from `compose.yaml` and point `DATABASE_URL` at it:

```bash
docker compose up -d --wait
export DATABASE_URL=postgres://hexablock:hexablock@localhost:5432/hexablock
pnpm db:generate   # writes a SQL migration into drizzle/ from src/adapters/persistence/schema.ts
pnpm db:migrate    # applies the drizzle/ migrations to DATABASE_URL
docker compose down
```

The schema has the `users` table of API-FR-01. The other business tables are still the design.

## Running Tests

```bash
pnpm test          # unit, gate and integration tests, then e2e tests
pnpm test:unit     # unit, gate and integration tests only
pnpm test:e2e      # HTTP end-to-end tests only
pnpm verify        # lint, format:check, typecheck, test, arch, openapi:check (the CI gate)
pnpm openapi:check # fails when openapi/openapi.json differs from the built app
pnpm openapi:export # rewrites openapi/openapi.json after an HTTP change
```

Name each test `should_<expected_result>_when_<condition>`. The gate
`test/gates/test-name.gate.spec.ts` fails on any other name.

Integration tests in `test/integration` run on Postgres in memory (PGlite) through
`test/support/test-database.ts`, which applies the `drizzle/` migrations. They need no Docker.
Never test on a shared Postgres.

After every HTTP change, run `pnpm openapi:export` and commit `openapi/openapi.json`. The client
generates its API types from it, and `pnpm openapi:check` fails when the file drifts.

Contract tests verify the client pact against a running API. The CI job `contract` runs them on
every pull request with the pact from the client `main` branch.

```bash
pnpm build && PORT=3000 node dist/main.js &   # start the API
pnpm contract:verify                          # pact from hexablock-app main, API at BACKEND_URL
PACT_FILE=test/fixtures/contract/hexablock-app-hexablock-api.json pnpm contract:verify
```

`BACKEND_URL` defaults to `http://localhost:3000`. A missing pact fails the run.

## AI Usage Documentation

TODO: summarize the AI tools used. The full log lives in [AI_USAGE.md](AI_USAGE.md).

## Contributing

Read [AGENTS.md](AGENTS.md) first: it lists every rule and the gate that enforces it.

1. Branch from `main`.
2. Write Conventional Commits in English. The commit-msg hook and the CI `verify` job run
   commitlint.
3. Never bypass a git hook. CI repeats every hook check.
4. Run `pnpm verify` before you push. CI runs the same command in the `verify` job.
5. Add your entry to [AI_USAGE.md](AI_USAGE.md) and update the docs that your change touches.
6. Open a pull request against `main` with the template. Merge it with a merge commit, only when
   the `verify` and `contract` jobs are green.

At the end of each sprint, the team tags `v0.N.0` and moves the `[Unreleased]` entries of
[CHANGELOG.md](CHANGELOG.md) into the version section (rule R-sprint-release).

## License

TODO: confirm the copyright holder. The code is under the [MIT License](LICENSE).
