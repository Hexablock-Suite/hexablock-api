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

- **Accounts (API-FR-01):** sign-up and sign-in with JWT. A username is stored as typed. Sign-up
  rejects a username that differs from a stored one only in letter case (`Ada` after `ada`) with
  the same 409 as an exact duplicate, and sign-in ignores letter case the same way, so `ADA` signs in the stored `ada`.
- **Progress (API-FR-02):** progress sync, one entry per user and per `gameId`.
- **Leaderboard (API-FR-03):** a global leaderboard per `gameId`, and a per-level leaderboard for
  Fit and Sort. The per-level leaderboard ranks more stars first, then fewer moves, then less
  time (DS-4).
- **Levels (API-FR-04):** read and update the level definitions of Fit and Sort, so new levels
  reach players without an app update.
- **API docs (API-FR-05):** Swagger at `/docs` and the committed `openapi/openapi.json`.
- **Errors (API-FR-06):** one error body shape for every HTTP error.

Today `src/` holds the health endpoint, the `Clock` port and its adapter, the database
connection, the `HttpErrorFilter` that gives every HTTP error the `ErrorDto` body, and the
`PlayerProgress` aggregate in `src/domain/progress` with its `ProgressRepository` port and its
Drizzle repository. It also holds sign-up, sign-in and `GET /v1/auth/me`, the first route behind
`JwtAuthGuard`, and the progress sync `POST /v1/progress` with its read `GET /v1/progress/{gameId}`,
both behind the guard. It holds the level schema of DS-6 with the Fit and Sort level validators,
the level store, the level read `GET /v1/levels` with no guard and the level update `PUT /v1/levels`
behind the guard. It holds the leaderboard reads `GET /v1/leaderboard/{gameId}` and
`GET /v1/leaderboard/{gameId}/levels/{levelId}`, both behind the guard. The rest is designed in [docs/architecture/](docs/architecture/) and is not built yet.

## Architecture

The API follows Clean Architecture with four layers (statement §3.4). Every source dependency
points toward the domain.

![The four Clean layers as concentric rings: the entities in the centre, then the use cases and their ports, the interface adapters, and the frameworks and drivers outside](docs/architecture/layers/views/layers-1-rings.png)

| Layer                      | Folder                                                                      | What lives there                                                                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Domain (entities)       | `src/domain`                                                                | Entities and value objects, such as `PlayerProgress` and `LevelDefinition`.                                                                                        |
| 2. Application (use cases) | `src/application`                                                           | Use cases, their input ports and the output ports that the adapters implement.                                                                                     |
| 3. Interface adapters      | `src/adapters` (`http`, `persistence`, `jwt`, `crypto`, `clock`, `logging`) | Every adapter of a port: Nest controllers, DTOs and mappers; Drizzle repositories and the schema; the clock, the logger, the token signer and the password hasher. |
| 4. Frameworks and drivers  | `src/infrastructure`                                                        | Glue code only: Nest modules, the configuration, the database connection and `AppModule`.                                                                          |

- **Ports live in the application layer (Q10).** For example, the `Clock` port is in
  [src/application/ports/clock.ts](src/application/ports/clock.ts). The domain never imports a
  port: a use case reads the instant and passes it to the domain as a parameter.
- **Every adapter of a port lives in layer 3 (#212, option C).** [SystemClock](src/adapters/clock/system-clock.ts)
  implements `Clock`. The Drizzle repositories in `src/adapters/persistence` implement the
  repository ports of users, progress and levels. Layer 4 keeps glue code only.
- **`AppModule` is the composition root.** [src/infrastructure/app.module.ts](src/infrastructure/app.module.ts)
  binds each port to one adapter. `src/main.ts` only starts the app.
- **The domain hides its state.** `PlayerProgress` has no getter: it delivers its parts to the
  border with `deliverTo()` (decision 2 of `classes.md`). A value object keeps its value private and
  delivers it to a receiver with `deliverTo()`; no operation returns it, and only the adapters
  of layers 3 and 4 receive it (decision 15 of `classes.md`,
  [#90](https://github.com/Hexablock-Suite/hexablock-api/issues/90)). `User` has no public
  field and no public constructor: `User.register()` and `User.restore()` build it, it delivers
  its parts to the border with `deliverTo()`, and `User.passwordMatches()` checks a `PasswordAttempt`
  through `PasswordVerifier`, an interface of the domain that the `PasswordHasher` port extends
  (decision 16 of `classes.md`,
  [#91](https://github.com/Hexablock-Suite/hexablock-api/issues/91)).
- **A gate enforces the layers.** `pnpm arch` runs dependency-cruiser with the rules in
  [.dependency-cruiser.cjs](.dependency-cruiser.cjs): `domain-imports-only-domain`,
  `domain-imports-no-cycle`, `domain-folder-imports-no-subfolder`, `application-imports-only-domain`, `adapters-never-import-infrastructure`,
  `http-adapters-never-import-persistence`, `persistence-adapters-never-import-http`,
  `persistence-adapters-never-import-nest`, `http-adapters-import-only-nest`,
  `persistence-adapters-import-only-drizzle` and `other-adapters-import-no-package`. Each folder of
  layer 3 imports only the library that it adapts, and the HTTP and persistence adapters never
  import each other. No file of `src/domain` reaches itself through its imports, and a shared file
  of a domain folder never imports a subfolder of that folder (#221).
  `test/gates/architecture.gate.spec.ts` tests them.

Full layer diagram and the place of each piece: [docs/architecture/layers.md](docs/architecture/layers.md).
Classes per layer: [docs/architecture/classes.md](docs/architecture/classes.md). The type, the owner
and the layer of each business rule:
[the table «Business rules»](docs/architecture/classes.md#business-rules). Extension points:
[docs/architecture/extensibility.md](docs/architecture/extensibility.md). The class to add and the file that
registers it, per axis: [docs/EXTENSIBILITY.md](docs/EXTENSIBILITY.md).
How one request crosses the layers, as a class view and a sequence diagram:
[docs/architecture/flows.md](docs/architecture/flows.md).

## Generic Engine

The API has no game engine; the generic engine lives in the app. The API stores the level
definitions that the engine plays, with generic types (decision D6):

- **`LevelDefinition<TSection extends LevelSection = LevelSection>`** holds the common part
  (`gameId`, `levelId`, `order`, `version`, `topology`) and one typed section per `gameId` (DS-6).
  `TSection` is `FitSection` or `SortSection`. Lines and Merge have no level files. The bound is
  on the class because the class holds the section in a field of type `TSection` and asks it
  `mostStars()`, the count of its star thresholds; `LevelSection` is the interface of every
  section. The default `LevelSection` names a level of any game, so a list of levels of several
  games is a `LevelDefinition[]`: only the strategy of each game knows its section type (#222).
- **`LevelValidator<TSection extends LevelSection>`** checks the shape and the rules of one
  section, for example the A5 check of a Fit level. `LevelValidators` registers one validator per
  `gameId`. The bound says that each strategy builds a section that a `LevelDefinition` can hold,
  so `LevelValidators` keeps every strategy as a `LevelValidator<LevelSection>` and builds the level
  from it.
- **`UseCase<TRequest, TResponse>`** is the one generic input port. Every use case binds it, and
  every failure type has a `kind`, so one aspect class wraps any use case.
- **`Result<T, E>`** carries an expected failure as a value, never as an exception.
- **[`Range<T>`](src/domain/shared/range.ts)** is a closed interval over a value that orders itself
  (`T extends Ordered<T>`), with `contains(value: T): boolean`. The username (3 to 32) and password
  (8 to 128) length limits are the `Range<CharacterCount>` values `USERNAME_LENGTH` and
  `PASSWORD_LENGTH` in `src/domain/user`. `CharacterCount` counts code points, so an emoji is one
  character. The value objects ask the ranges, and the ranges deliver their bounds to the HTTP error messages and `CredentialsDto`. The professor modeled the limits
  of the statement as a generic range with a contains method in the session of 2026-11-06.

Each of these types is code: [LevelDefinition](src/domain/level/level-definition.ts),
[LevelValidator](src/domain/level/level-validator.ts),
[LevelValidators](src/domain/level/level-validators.ts), [UseCase](src/application/use-case.ts)
and [Result](src/domain/shared/result.ts).

A new variant with level files adds a section type, a validator and one entry in the composition
root. No existing class changes. See [docs/architecture/extensibility.md](docs/architecture/extensibility.md)
and views 1.2 and 2.3 of [docs/architecture/classes.md](docs/architecture/classes.md).

## Design Patterns

Each pattern below is code. The Source column links the files that implement it, and the
Design column links the view of [classes.md](docs/architecture/classes.md#patterns) that draws it.

| Pattern                            | Classes                                                                                              | Quality it protects                                 | Reason                                                                                                        | Source                                                                                                                                                                                                                                                                  | Design                                                                                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Strategy                           | `LevelValidator`, `FitLevelValidator`, `SortLevelValidator`; `LevelValidators` picks one by `gameId` | Extensibility: a new variant adds one validator     | Each `gameId` with levels registers the validator that checks its section (§3.3, DS-6, API-FR-04, A5).        | [level-validator.ts](src/domain/level/level-validator.ts), [fit-level-validator.ts](src/domain/level/fit/fit-level-validator.ts), [sort-level-validator.ts](src/domain/level/sort/sort-level-validator.ts), [level-validators.ts](src/domain/level/level-validators.ts) | [view 1.2](docs/architecture/classes.md#view-12-the-level-schema)                                                                                            |
| Decorator                          | `UseCaseAspect`, `LoggingAspect`                                                                     | Separation: no cross-cutting code inside a use case | An aspect of §3.5 wraps any use case and adds no code to it (API-NFR-07, A2). Q12 put the aspects in layer 2. | [use-case-aspect.ts](src/application/aspects/use-case-aspect.ts), [logging-aspect.ts](src/application/aspects/logging-aspect.ts)                                                                                                                                        | [view 2.1](docs/architecture/classes.md#view-21-the-use-case-contract-and-its-aspects)                                                                       |
| Adapter                            | The Drizzle repositories; `SystemClock`, `ScryptPasswordHasher`, `JwtTokenIssuer`                    | Replaceability: a new database engine or driver     | A new database engine means new adapters, and the use cases do not change (§3.3, §3.4, §8).                   | [src/adapters/persistence](src/adapters/persistence), [system-clock.ts](src/adapters/clock/system-clock.ts), [scrypt-password-hasher.ts](src/adapters/crypto/scrypt-password-hasher.ts), [jwt-token-issuer.ts](src/adapters/jwt/jwt-token-issuer.ts)                    | [views 3.1, 3.2, 3.4](docs/architecture/classes.md#part-3-adapters-and-drivers)                                                                              |
| Singleton (single-scope injection) | `AppModule` and its providers                                                                        | Consistency: one shared instance of each adapter    | One instance of each adapter for the whole API (§3.3).                                                        | [app.module.ts](src/infrastructure/app.module.ts)                                                                                                                                                                                                                       | [view 3.4](docs/architecture/classes.md#view-34-wiring)                                                                                                      |
| Memento                            | `PlayerProgress`, `User` and their receivers                                                         | Encapsulation: the aggregate hides its state        | The aggregate has no getter: it delivers its parts to the border, and `restore()` builds it again.            | [player-progress.ts](src/domain/progress/player-progress.ts), [user.ts](src/domain/user/user.ts), [received.ts](src/adapters/received.ts)                                                                                                                               | [views 1.1](docs/architecture/classes.md#view-11-progress-and-level-results), [1.3](docs/architecture/classes.md#view-13-the-user-and-its-credential-values) |

Abstract Factory is also mandatory in §3.3. The app holds it, one factory per variant. The API
does not use it: a variant has one product, its level validator (decision 8 of `classes.md`).

## SOLID Principles

Each principle has one example from the progress slice. Each link opens the source file.

- **Single responsibility:** [LoggingAspect](src/application/aspects/logging-aspect.ts) only
  logs each call, so [SyncProgressUseCase](src/application/progress/sync-progress.use-case.ts)
  holds no logging code.
- **Open/closed:** a new cross-cutting concern extends
  [UseCaseAspect](src/application/aspects/use-case-aspect.ts) and changes one binding in
  [AppModule](src/infrastructure/app.module.ts); no use case changes, as `LoggingAspect` showed.
- **Liskov substitution:**
  [DrizzleProgressRepository](src/adapters/persistence/drizzle-progress-repository.ts) and the
  in-memory fake pass the same
  [ProgressRepository contract](test/support/progress-repository.contract.ts), so a use case
  takes either one.
- **Interface segregation:** the [SyncProgress](src/application/progress/sync-progress.use-case.ts)
  input port has one `execute` method, and
  [ProgressController](src/adapters/http/progress.controller.ts) depends only on `SyncProgress`
  and `GetProgress`, the two ports it calls. `SyncProgressUseCase` holds only
  [LevelFinder](src/application/ports/level-repository.ts), the one role of `LevelRepository`
  that a sync calls (#193).
- **Dependency inversion:** the application owns the
  [ProgressRepository](src/application/ports/progress-repository.ts) port,
  [DrizzleProgressRepository](src/adapters/persistence/drizzle-progress-repository.ts) implements
  it, and [AppModule](src/infrastructure/app.module.ts) binds one to the other.

## AOP

The cross-cutting aspect is logging (§3.5, API-NFR-07): each entry of a call holds the use case, the outcome and the duration. It wraps use cases as
a decorator: `UseCaseAspect` implements `UseCase`, the generic interface that each input port binds, and `LoggingAspect` extends it ([View 2.1](docs/architecture/classes.md#view-21-the-use-case-contract-and-its-aspects)).
They are custom decorators or proxies, never Nest interceptors, because `src/application`
imports no package (rule R-application-pure).

The aspects live in the application layer: **Q12** in [layers.md](docs/architecture/layers.md#resolved-questions).
In the session of 2026-11-06 the professor answered that the aspects talk to the use case, so they
belong there, built as decorators with one interface common to the use cases, without libraries.
`UseCaseAspect`, `LoggingAspect` and `AuthorizationAspect` live in [src/application/aspects](src/application/aspects).
`LoggingAspect` writes a typed entry to the `Logger` port
([src/application/ports/logger.ts](src/application/ports/logger.ts)), and `NestLogger` in
[src/adapters/logging](src/adapters/logging) implements it and writes the text.
`AppModule` wraps `RegisterUseCase`, `LoginUseCase`, `AuthenticateTokenUseCase`, `SyncProgressUseCase`, `GetProgressUseCase`,
`GetLevelsUseCase`, `UpdateLevelsUseCase`, `GetGlobalLeaderboardUseCase` and `GetLevelLeaderboardUseCase` in `LoggingAspect`,
each under the name of its input port, so a failed sign-in leaves a log entry (#170). For `UpdateLevelsUseCase`, `AuthorizationAspect` sits inside `LoggingAspect`, so a rejected level update leaves a log entry too (#180). It logs the use case name, the outcome and, for a failure, only its `kind`, so a
value that the client sent never reaches the log. For `GetLevels`, the aspect also writes one entry per stored level
row that breaks a rule, with its `gameId`, `levelId` and reason code, and no section, from `unavailableLevelEntries()`.
No use case imports the `Logger` port (rule `only-aspects-import-logger-port`, #219). A request value that breaks its rule stops in its
DTO mapper, such as `ProgressDtoMapper`, before the use case, so the aspect writes no entry for that
request. `LoggingAspect` reads the `Stopwatch` port before and after each call, and the one entry of the call carries
`elapsedMs`, the duration in milliseconds; `PerformanceStopwatch` in [src/adapters/clock](src/adapters/clock) reads the
monotonic clock of `performance`. No second aspect writes a timing entry (#181).

## Getting Started

You need Node 26.13.1 (through [fnm](https://github.com/Schniz/fnm)), pnpm and, for database
work, Docker.

```bash
fnm use            # reads .node-version (Node 26.13.1)
pnpm install       # also installs the git hooks
pnpm start:dev     # http://localhost:3000/v1/health, docs at /docs, JSON at /docs-json
```

`.node-version` names the exact Node of the three CI jobs. `engines.node` of `package.json` accepts
`>=26.13.1 <27`, so a newer Node 26 also works. `engineStrict: true` in `pnpm-workspace.yaml` makes
`pnpm install` and every `pnpm` script stop on an older or another major version (#250):

```text
[ERR_PNPM_UNSUPPORTED_ENGINE] Unsupported environment (bad pnpm and/or Node.js version)

Your Node version is incompatible with "<repository path>".

Expected version: >=26.13.1 <27
Got: v26.7.0
```

The API reads `PORT` (default `3000`), `DATABASE_URL` and `JWT_SECRET` from the environment, and does not
start without the last two. `.env.example` lists them. Copy it to `.env`, set `JWT_SECRET` to a random
value of at least 32 characters, and load it before you start the API:

```bash
cp .env.example .env   # .gitignore keeps .env out of git
set -a && . ./.env && set +a
pnpm start:dev
```

The pool connects on the first query, so `/v1/health` answers without a running database.
Sign-up and sign-in (`POST /v1/auth/register`, `POST /v1/auth/login`) need the database and its migrations.
`GET /v1/auth/me`, `POST /v1/progress` and `GET /v1/progress/{gameId}` need the header
`Authorization: Bearer <accessToken>` from `POST /v1/auth/login`.
Without a valid token it answers 401 with the `ErrorDto` body.

`PUT /v1/levels` also needs an account in the list of level editors
([#145](https://github.com/Hexablock-Suite/hexablock-api/issues/145)). `LEVEL_EDITOR_IDS` holds
the user ids of those accounts, separated by commas; the API trims each entry and skips an empty
one. The list holds ids, not usernames, because another person can sign up a name first. To find
the id of an account, sign up and sign in, then call `GET /v1/auth/me` with its token: the answer gives
the `userId`, the same value as the `sub` claim of the token. Then restart the API with the id:

```bash
export LEVEL_EDITOR_IDS=0b6f6a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b,6f1c1d0e-2b7a-4c55-9a51-0d6c7a1e8f01
pnpm start:dev
```

An unset or empty `LEVEL_EDITOR_IDS` lets no account update the levels: every `PUT /v1/levels` whose
body passes the shape check gets 403 with the `ErrorDto` body; a malformed body gets 400 first (#180). An entry that is not a UUID stops the start, as a missing `JWT_SECRET`
does. The account that a deploy uses to send the levels must be in the list (see [Deploy](#deploy)).

Sign-up and sign-in have a rate limit for each client
([#170](https://github.com/Hexablock-Suite/hexablock-api/issues/170)). `AUTH_RATE_LIMIT` is the
number of requests that one IP address may send to `POST /v1/auth/register`, and the same number to
`POST /v1/auth/login`, in one minute. Unset or empty, it is `10`, the default decided on 2026-11-28.
`off` turns the limit off, as the tests and the provider composition of the contract job do; with
`NODE_ENV=production`, `off` stops the start, as the example `JWT_SECRET` does. Any other value that
is not a whole number of 1 or more stops the start. Each answer under the limit carries
`X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`. A request over the limit
answers 429 with the `ErrorDto` body and a `Retry-After` header. The API counts by the IP address of the connection, so behind a proxy every
client shares the address of the proxy.

For database work, start the local Postgres from `compose.yaml` and point `DATABASE_URL` at it:

```bash
docker compose up -d --wait
export DATABASE_URL=postgres://hexablock:hexablock@localhost:5432/hexablock
pnpm db:generate   # writes a SQL migration into drizzle/ from src/adapters/persistence/schema.ts
pnpm db:migrate    # applies the drizzle/ migrations to DATABASE_URL
docker compose down
```

The migration `drizzle/0002_username_lower_unique.sql` adds a unique index on `lower(username)`
([#62](https://github.com/Hexablock-Suite/hexablock-api/issues/62)). It fails with `23505` on a
database that already holds two usernames that differ only in letter case, such as `ada` and `Ada`.
The failed migration keeps every row, and the migrator does not record it, so it can run again
later. Before you deploy it, run this query on the target database. An empty result means that the
migration can run:

```sql
SELECT lower(username), count(*) FROM users GROUP BY 1 HAVING count(*) > 1;
```

When the query returns a row, the team decides which account keeps the name. That is a product
decision, so no migration chooses the account or changes the rows
([#69](https://github.com/Hexablock-Suite/hexablock-api/issues/69)). The test
`test/integration/username-lower-unique.migration.spec.ts` pins this behavior.

The migration `drizzle/0003_username_key.sql` replaces that index
([#73](https://github.com/Hexablock-Suite/hexablock-api/issues/73)). It adds the column
`username_key` with a plain unique index. The column holds `Username.key`: the name in lower case,
which the domain computes. The database applies no letter case rule of its own. The column is
`NOT NULL`, and the migration fills no value, so it fails on a database that already holds a user.
The migrator runs all pending migrations in one transaction, so a later migration cannot repair
that database. The repository has no down migrations.

A local compose database created before `0003` that holds a user reaches the current schema only through a reset; with no user, `pnpm db:migrate` applies `0003` as it is
([#172](https://github.com/Hexablock-Suite/hexablock-api/issues/172)). **The reset deletes every
row of the local database**: every user, every progress entry and every level. Run it from the
repository root:

```bash
docker compose down -v   # stops the postgres service and removes its volume postgres-data
docker compose up -d --wait
export DATABASE_URL=postgres://hexablock:hexablock@localhost:5432/hexablock
pnpm db:migrate          # applies every drizzle/ migration to the empty database
```

The reset is for a local database only. No deployed database holds users today, and the
repository has no procedure for a deployed database with users. Before such a database runs
`0003`, the team writes that procedure, after the duplicate check above.

`src/adapters/persistence/schema.ts` declares four tables: `users` (API-FR-01), `progress`
(API-FR-02), `level_results` (the level results of a progress entry, DS-5) and `levels`
(API-FR-04).

### Deploy

The repository has no deploy workflow, so the person who deploys runs these steps by hand, in this order
([#158](https://github.com/Hexablock-Suite/hexablock-api/issues/158), decision of 2026-11-27):

1. Apply the `drizzle/` migrations to the target database with `pnpm db:migrate`.
2. Start the new API with `LEVEL_EDITOR_IDS` that holds the id of the deploy account. Do not route
   traffic to it yet. On a new database the account does not exist yet: sign it up on the new API,
   read its id from `GET /v1/auth/me`, and restart the API with that id, as the paragraph on
   `LEVEL_EDITOR_IDS` above says.
3. In a checkout of hexablock-app at the release that players get, run `pnpm levels:load` against
   the new API with the token of the deploy account. The command sends the bundled level files of
   `src/adapters/levels/` to `PUT /v1/levels` as they are (S3-02).
4. In the same checkout, run `pnpm levels:check` against the new API. It fails when a bundled file
   differs from the stored copy. A stored copy with a higher `version` than its bundled file is not
   a drift: the version rule of S3-10 keeps the higher copy.
5. Route traffic to the new API only after both commands pass.

The order counts. Until the load runs, the board of a bundled level answers 404 (API-FR-03), and a
sync that carries a result of a bundled level answers 400 with `unknown-level` and stores nothing
of that sync (DS-6). The load is safe to repeat: an equal `version` replaces the stored copy with the
same level, and a lower `version` keeps the stored copy and gets `older-version`. The README of
hexablock-app gives the options of both commands.

## Running Tests

```bash
pnpm test           # both suites: unit, integration and gate tests, then e2e tests
pnpm test:behavior  # behavior suite: unit, integration and e2e tests, without the gates
pnpm test:gates     # gate suite only
pnpm test:unit      # unit, integration and gate tests only
pnpm test:fast      # fast feedback: the unit and domain tests only, in seconds
pnpm test:e2e       # HTTP end-to-end tests only
pnpm verify         # lint, format:check, typecheck, test, arch, openapi:check (the CI gate)
pnpm openapi:check  # fails when openapi/openapi.json differs from the built app
pnpm openapi:export # rewrites openapi/openapi.json after an HTTP change
```

The tests form two suites. A behavior test runs the code and checks what it does. A gate test reads
the code, the documents or the configuration to hold a rule of design or of process. The gate suite
holds the files of `test/gates/` and three gates that live with behavior tests:
`test/integration/in-memory-database.spec.ts` (rule R-database-harness),
`test/domain/level/level-problem.spec.ts` (it compares `docs/level-format.md` and
`openapi/openapi.json` with the code) and the OpenAPI drift test of `test/health.e2e-spec.ts` (rule
R-openapi-drift). `vitest.gates.config.ts` lists the gates, and `vitest.behavior.config.ts`
selects every other test of `pnpm test`. `pnpm test` runs both suites, so `pnpm verify` and the CI
`verify` job run every gate. The gate `test/gates/test-suites.gate.spec.ts` fails when a test file
of `pnpm test` is in no suite. Each suite reports the tests of `test/health.e2e-spec.ts` that belong
to the other suite as skipped.

On 2026-11-28 the Vitest JSON reporter counts 1,452 tests in `pnpm test`: 1,334 behavior tests and
118 gate tests. The 16 tests of the two advisory-lock suites are behavior tests, and they skip
unless `HB_TEST_PG_URL` is set (rule R-database-harness).

`pnpm test:fast` is the fast feedback command for the inner loop (#256). It runs the 881 tests of
`test/unit/` and `test/domain/`, which start no database and no HTTP application. One gate is among
them: `test/domain/level/level-problem.spec.ts`. The command skips the integration tests of
`test/integration/`, the e2e tests and the other gates. `pnpm test`, `pnpm verify` and the CI
`verify` job still run every test, so run `pnpm verify` before you push. `pnpm test:unit` is not
the fast command: it also runs the integration tests and the gates.

The times below are from the Vitest JSON reporter and the wall clock of two runs of each command, one
run at a time. They were measured on 2026-11-28, Node v26.13.1, with the 1-minute load before each run:

| Command                                                | Tests              | Run 1              | Run 2              |
| ------------------------------------------------------ | ------------------ | ------------------ | ------------------ |
| `pnpm test:fast`                                       | 881                | 6.3 s (load 16.0)  | 5.6 s (load 16.1)  |
| `pnpm test:gates`                                      | 102 + 2 skipped    | 8.3 s (load 14.9)  | 8.4 s (load 14.5)  |
| `pnpm test:unit`                                       | 1,149 + 16 skipped | 31.4 s (load 12.7) | 33.2 s (load 13.3) |
| `pnpm exec vitest run --config ./vitest.config.e2e.ts` | 208                | 84.3 s (load 13.5) | 107.5 s (load 9.1) |

The gate suite alone takes longer than the unit and domain tests, so `pnpm test:fast` leaves it out.
In 13 of the 14 e2e files, `beforeEach` starts a new Nest application on a new PGlite database for
each test. Each such test takes at least 1.2 s, and a sign-in test of `test/auth-sign-in.e2e-spec.ts`,
which starts one application for its file, takes about 40 ms. In `pnpm test:fast`,
`test/unit/infrastructure/database-pool-shutdown.child.spec.ts` takes 4.8 s of the run alone, because it
builds the app with `pnpm build` and starts `dist/main.js` in a child process.

Name each test `should_<expected_result>_when_<condition>`. The gate
`test/gates/test-name.gate.spec.ts` fails on any other name.

A use case test of `test/unit/application/` has three layers (API-NFR-01, #254). The test case
reads Given / When / Then in the words of the domain and names no test double. It calls the
Testing API of its use case in `test/support/testing-api/`, such as `LoginTestApi`: the `given…`
steps return the Testing API, the `when…` steps are `async`, call the use case and return
`Promise<this>`, and the `then…` steps assert. The Testing API builds the use case and holds its
test doubles as private fields, so a new collaborator of a use case changes only its Testing API.
Below it, the Object Mothers of `test/support/object-mother/`, such as `UserMother`, build
domain data with the public factories and know no double. Each `then…` step fails when no
`when…` step ran. `pnpm lint` fails on a test that asserts neither with `expect` nor through a
`then…` step (`vitest/expect-expect`), and on a `when…` step without `await`
(`typescript/no-floating-promises`). Every test file of `test/unit/application/` has this shape, the
tests of `LoggingAspect` and `AuthorizationAspect` included, and so has the test of the domain
service `LevelValidators` in `test/domain/level/`: its `when…` steps are `async` too, although
`check()` is synchronous.

The review demo (#257) shows that the tests hold the behavior, not the shape of the code. Run it on a
scratch branch and never push that branch: a push starts CI and leaves a branch that nobody merges.
First count the two suites with `pnpm test:behavior` and `pnpm test:gates`: the 1,334 behavior
tests and the 118 gate tests above. Then make two changes, one at a time, undo each one before the
next, and run `pnpm test` after each:

1. A refactor that keeps the behavior. Add the `Clock` port to the constructor of `LoginUseCase`,
   inject `CLOCK` in the `LOGIN` factory of `AppModule`, and give `LoginTestApi` a `FixedClock`.
   `pnpm test` stays green, and `git diff --stat` names `src/application/auth/login.use-case.ts`,
   `src/infrastructure/app.module.ts` and `test/support/testing-api/login.test-api.ts` only. No test
   case changes, because only the Testing API builds the use case.
2. A change of behavior. In `Standing.isBetterThan()` (`src/domain/progress/standing.ts`), compare
   the time before the moves. `pnpm test` fails on two named tests:
   `should_rank_fewer_total_moves_first_when_stars_and_levels_completed_are_equal` of
   `test/domain/progress/standing.spec.ts` and
   `should_rank_the_board_by_the_standing_comparison_when_the_entries_come_in_no_order` of
   `test/domain/progress/ranked-board.spec.ts`. Each failure shows the expected and the received
   value.

Integration tests in `test/integration` run on Postgres in memory (PGlite) through
`test/support/test-database.ts`, which applies the `drizzle/` migrations. They need no Docker.
Never test on a shared Postgres.

After every HTTP change, run `pnpm openapi:export` and commit `openapi/openapi.json`. The client
generates its API types from it, and `pnpm openapi:check` fails when the file drifts.

Contract tests verify the client pact against a running API. The CI job `contract` runs them on
every pull request with the pact from the client `main` branch. They run against the provider
composition of [start-provider.js](scripts/contract/start-provider.js): `AppModule` on an
in-memory PGlite database, plus the state-change endpoint `POST /v1/_pact/provider-states`.
Before and after each interaction, the verifier posts the provider state of the interaction to
that endpoint (#151). Only this composition mounts the endpoint: the production `AppModule` and
`dist/main.js` never do, because the endpoint writes any data for anyone. So the command listens on
`127.0.0.1` only, and it pins an empty `LEVEL_EDITOR_IDS`, so a value of the shell never reaches it
(#239). `http://localhost:<PORT>` still reaches it: `localhost` resolves to `127.0.0.1`, and curl,
Node `fetch` and the Pact verifier try each address of the name. The `contract` job of hexablock-app
checks out this repository at `main`, starts the same command with `PORT=3001`, and verifies its
own pact against `http://localhost:3001` with the same state-change endpoint. That job needs only
`pnpm install` in that checkout and the `.env.example` of the command: the composition runs on PGlite,
so the job needs no Postgres.

```bash
PORT=3000 node --env-file=.env.example scripts/contract/start-provider.js &   # start the provider composition
pnpm contract:verify                          # pact from hexablock-app main, API at BACKEND_URL
PACT_FILE=test/fixtures/contract/provider-states.json pnpm contract:verify
```

`BACKEND_URL` defaults to `http://localhost:3000`. A missing pact fails the run.

The provider states of the client interactions (app #45 to #48, #480 and #485). Each param is optional. A
request takes a value of the setup through a provider-state expression, such as
`fromProviderState('Bearer ${accessToken}', …)`. The states of one interaction add up, and the
teardown after each interaction removes every row. A failed setup gets no teardown, so
`no account exists` removes every row too, also the rows of a state before it in the same
interaction: it goes first among the states of its interaction (#239). A state whose sign-in fails
answers 400 with the status of the sign-in, such as `the sign-in of ada answered 401, not 200.`.

| State                                                  | Params (default)                                                                                                       | Values                                                           | Client     |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------- |
| `no account exists`                                    | none                                                                                                                   | none                                                             | #45        |
| `an account exists`                                    | `username` (`ada`), `password` (`correct horse battery`)                                                               | `username`                                                       | #45        |
| `a signed-in account exists`                           | `username`, `password`                                                                                                 | `accessToken`, `userId`, `username`                              | #45 to #47 |
| `a level is stored`                                    | `gameId` (`hexa-fit` or `hexa-sort`; `hexa-fit`), `levelId` (`fit-01`)                                                 | `gameId`, `levelId`                                              | #46, #48   |
| `the signed-in account has progress on a stored level` | the params of the two states above; the result has 3 stars and 12 moves                                                | `accessToken`, `userId`, `username`, `gameId`, `levelId`         | #46        |
| `several accounts have results on a stored level`      | `gameId`, `levelId`; `ada`, `grace` and `linus` sync 10, 12 and 14 moves                                               | `accessToken` of `ada`, `gameId`, `levelId`                      | #47        |
| `several accounts have high scores in a game`          | `gameId` (`hexa-lines`); `ada`, `grace` and `linus` sync the scores 300, 200 and 100 and no level result               | `accessToken` of `ada`, `gameId`                                 | #480       |
| `a broken level is stored`                             | `gameId` (`hexa-fit` or `hexa-sort`; `hexa-fit`), `levelId` (`fit-01`); the row has a Fit section that breaks its rule | `gameId`, `levelId`, `reason` (`invalid-figure` for a Fit level) | #485       |

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
