# Changelog

All notable changes to this repository are documented in this file. The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

Each sprint of the plan in [`hexablock-app/docs/ROADMAP.md`](https://github.com/Hexablock-Suite/hexablock-app/blob/main/docs/ROADMAP.md) closes with a version section and a `v0.N.0` tag, the same tag as the app (rule R-sprint-release in `AGENTS.md`). The final delivery is `v1.0.0`.

## [Unreleased]

### Added

- Tests for the review gaps of the Sprint 2 queue ([#48](https://github.com/Hexablock-Suite/hexablock-api/issues/48)): 44 of the 60 gaps that the walkthrough found in #32 and #39 to #47 now have a test, and each new test fails on a mutation of the code it guards. The test double `InMemoryProgressRepository` now stores and returns copies, as the port contract asks of every adapter. The other 16 gaps have no test: 7 defects, 7 open team questions and 2 that no test can show; the pull request lists each one.
- One e2e save-and-load test per variant (API-NFR-03) in `test/progress-variants.e2e-spec.ts`: `hexa-fit` and `hexa-sort` save level results, `hexa-lines` and `hexa-merge` save a high score. Each test saves its own `gameId` and one other variant, and checks that `GET /progress/{gameId}` returns only its own entry. `signIn` moves to `test/support/http/sign-in.ts` for every progress e2e spec ([#36](https://github.com/Hexablock-Suite/hexablock-api/issues/36)).
- Progress sync and read (API-FR-02), both behind `JwtAuthGuard`: `POST /progress` takes `gameId` (required), an optional `score` and optional level `results`, keeps one entry per user and `gameId`, and answers 200 with `ProgressDto` (`gameId`, `highScore`, `updatedAt`, `results`); `GET /progress/{gameId}` answers the entry or 404. The `userId` comes from the token, never from the body. A missing `gameId` or a broken value rule answers 400, and a missing token 401, with the `ErrorDto` body. `SyncProgressUseCase` reads the instant from `Clock`; it and `GetProgressUseCase` bind the new `UseCase<TRequest, TResponse>` input port contract and return a `Result`; `ProgressDtoMapper` translates the DTOs ([#35](https://github.com/Hexablock-Suite/hexablock-api/issues/35)).
- The `progress` and `level_results` tables of DS-5 through the migration `drizzle/0001_create_progress.sql`: `progress` keeps one row per `user_id` and `game_id`, with `user_id` referencing `users.id`, and `level_results` keeps one row per `user_id`, `game_id` and `level_id`. `DrizzleProgressRepository` saves the `PlayerProgress` aggregate over both tables in one transaction and passes the port contract on PGlite; `PlayerProgress.restore` rebuilds a stored aggregate, and the progress aggregate, its port and its adapters now use the `UserId` of `src/domain/user` ([#34](https://github.com/Hexablock-Suite/hexablock-api/issues/34)).
- The `PlayerProgress` aggregate root in `src/domain/progress`, one per `userId` and `gameId` (API-FR-02), with the `UserId`, `GameId` and `LevelResult` value objects, and the `ProgressRepository` port in `src/application/ports`; an in-memory fake runs the port contract in `test/support/progress-repository.contract.ts` ([#33](https://github.com/Hexablock-Suite/hexablock-api/issues/33)).
- The first aspect over a use case (§3.5, API-NFR-07): `UseCaseAspect` implements the `UseCase` input port and keeps the use case it wraps, and `LoggingAspect` extends it and logs the use case name, the outcome (`success`, `failure` or `error`) and the error through the Nest logger. Both live in `src/infrastructure/aspects`, as decision 10 of `docs/architecture/classes.md` says while Q12 is open, so there is no `Logger` port. `AppModule` binds `SYNC_PROGRESS` to `LoggingAspect` over `SyncProgressUseCase`; the HTTP behavior does not change ([#37](https://github.com/Hexablock-Suite/hexablock-api/issues/37)).
- CI job `postgres-lock`: on every pull request it runs `test/integration/drizzle-progress-repository.concurrency.spec.ts` against a throwaway Postgres 16 service, and it fails when the suite is skipped. PGlite runs one session, so only this job shows that two syncs of one user and game wait for one lock. Rule R-database-harness names this suite as its one exception.

### Changed

- `docs/REQUIREMENTS.md` §4 adds two offline sync rules that the team closed on 2026-11-06. DS-11: the level copy with the higher `version` wins, so a level update reaches players only when it raises `version`. DS-12: the level results table keeps the best result per user, game and level, and the high score keeps the highest value. DS-12 closes the every-attempt question of DS-4; the order that defines the best result stays open in DS-4.
- The README section "SOLID Principles" gives one example per principle from the progress slice, each with a link to its source file: `LoggingAspect`, `UseCaseAspect`, the `ProgressRepository` port and its contract, `DrizzleProgressRepository`, the `SyncProgress` port and `AppModule`. The gate `test/gates/solid-principles.gate.spec.ts` checks the five principles and every link (API-NFR-06, [#38](https://github.com/Hexablock-Suite/hexablock-api/issues/38)).

### Fixed

- No `ErrorDto` body holds the query of the request ([#68](https://github.com/Hexablock-Suite/hexablock-api/issues/68)). `HttpErrorFilter` removes each copy of the query from `message` and `details`, as it already did for `path`. Before, `GET /no-such-resource?token=secret-value` answered the 404 `message` `Cannot GET /no-such-resource?token=secret-value`; now it answers `Cannot GET /no-such-resource`. A message that does not quote the query does not change.
- Three follow-ups from the review of the Sprint 1 and Sprint 2 pull requests ([#55](https://github.com/Hexablock-Suite/hexablock-api/issues/55)). The `path` field of the `ErrorDto` body ends at the first `?`, so an error for `GET /no-such-resource?token=secret-value` answers `path` `/no-such-resource`, and a client that logs error bodies no longer logs the query in `path` (gap G2.4); `openapi/openapi.json` says so. The `ProgressRepository` port promises the level results in ascending `levelId` order, compared as text, as the Drizzle adapter reads them; the in-memory double now sorts them the same way, and the port contract checks the order (gap G3.3). The determinism gate restores the environment in an `afterEach`, so a failed test no longer leaves the fake `JWT_SECRET` to the next tests.
- Seven defects that the test-gap review found ([#51](https://github.com/Hexablock-Suite/hexablock-api/issues/51)): a blank or non-string `UserId` is rejected; the dummy password is hashed when the login use case starts, so an unknown username costs one scrypt check, as a wrong password does; the guard accepts the `bearer` scheme in any letter case (RFC 7235); an invalid clock date gives a 500, not a 400; two overlapping syncs of one user and game keep the highest score: `ProgressRepository.update()` runs the read, the change and the save of a sync under a Postgres advisory lock per user and game, and the rule stays in the domain; `LoggingAspect` writes a `bigint` as text and never lets a logger failure change the result of the use case.
- Two overlapping syncs of one user and game lost the level results of one of them, and a stale sync could move `updatedAt` back. The same lock of `ProgressRepository.update()` makes the second sync read what the first one saved, and the use case reads the clock under that lock ([#51](https://github.com/Hexablock-Suite/hexablock-api/issues/51)).

## [0.1.0] - 2026-11-06

### Added

- A token guard (API-FR-01): `JwtAuthGuard` calls the `AuthenticateToken` input port, and `AuthenticateTokenUseCase` verifies the bearer token through `TokenIssuer`. `GET /auth/me` is the first guarded route: it answers 200 with the `userId` of the token, or 401 with the `ErrorDto` body when the token is missing, malformed, expired or signed with another key. `openapi/openapi.json` declares the bearer security scheme ([#31](https://github.com/Hexablock-Suite/hexablock-api/issues/31)).
- Sign-up and sign-in with JWT (API-FR-01): `POST /auth/register` answers 201, 400 or 409, and `POST /auth/login` answers 200 with `accessToken`, 400 or 401, with the `ErrorDto` body for every error. The `users` table enters through the migration `drizzle/0000_create_users.sql`. `ScryptPasswordHasher` stores a salted scrypt hash from `node:crypto`, and `JwtTokenIssuer` issues and verifies HS256 tokens with `@nestjs/jwt`. The API now needs `DATABASE_URL` and `JWT_SECRET`, listed in `.env.example` ([#30](https://github.com/Hexablock-Suite/hexablock-api/issues/30)).
- One error body for every HTTP error (API-FR-06): `HttpErrorFilter` answers each exception with `ErrorDto` (`statusCode`, `error`, `message`, `details`, `path`); an unexpected error becomes a 500 that hides its message; `openapi/openapi.json` lists `ErrorDto` ([#29](https://github.com/Hexablock-Suite/hexablock-api/issues/29)).
- Two more use case flows in `docs/architecture/flows.md`, each with a class view and a UML sequence diagram: login, with its unknown-user and wrong-password branches, and update levels, with the `LevelValidators` Strategy registry; a table names the path that each other use case follows ([#27](https://github.com/Hexablock-Suite/hexablock-api/pull/27)).
- A use case flow page, `docs/architecture/flows.md`, with a class view and a UML sequence diagram of the sync progress endpoint across the four layers ([#27](https://github.com/Hexablock-Suite/hexablock-api/pull/27)).

### Changed

- Sprint 0 closes with `v0.0.0`: the README marks the planned pieces as design, and `AI_USAGE.md` logs the work of 2026-11-04.
- `docs/REQUIREMENTS.md` records the answers of the session of 2026-11-03: C7 confirms A5, Q4 keeps the level update behind the token guard with no roles, and API-NFR-08 names Clean plus an architecture for games. Class view 2.2 drops a stray «results 1» label under «clock 1» ([#27](https://github.com/Hexablock-Suite/hexablock-api/pull/27)).
- The extensibility overview and the database engine view draw no line that starts or ends on a dashed frame, and draw one line per class where only some classes of a group have a relation: each driver and each Drizzle repository implements its own port, and each use case holds its own output port; the reading notes of `classes.md` and `extensibility.md` follow ([#27](https://github.com/Hexablock-Suite/hexablock-api/pull/27)).
- The class, extensibility and flow views draw a diamond only where it makes a GoF pattern visible, such as the `LevelValidators` Strategy registry; the progress and level schema attributes are use arrows with their role and multiplicity, and `flows.md` names `SaveProgress` as the app use case that calls the sync endpoint ([#27](https://github.com/Hexablock-Suite/hexablock-api/pull/27)).
- The class and extensibility views draw realization and diamond lines only between class boxes, join a dashed frame only with a use arrow, and list in each legend only the line kinds they draw; the layer diagram draws `implements` as a dotted realization edge ([#27](https://github.com/Hexablock-Suite/hexablock-api/pull/27)).
- The class diagrams draw use arrows between layers and keep diamonds inside one layer, and `JwtAuthGuard` calls a new `AuthenticateToken` input port ([#27](https://github.com/Hexablock-Suite/hexablock-api/pull/27)).

## [0.0.0] - 2026-11-01

### Added

- README statement sections filled from the design docs ([#12](https://github.com/Hexablock-Suite/hexablock-api/pull/12)).
- README brand banner, CI badge and one-line description ([#11](https://github.com/Hexablock-Suite/hexablock-api/pull/11)).
- Backend ports in the application layer and the class diagram ([#9](https://github.com/Hexablock-Suite/hexablock-api/pull/9)).
- This changelog, rule R-sprint-release and its gate `test/gates/changelog.gate.spec.ts`.
- Numbered functional and non-functional requirements, API-FR-n and API-NFR-n, each with a check ([#8](https://github.com/Hexablock-Suite/hexablock-api/pull/8)).
- Draft layer diagram in `docs/architecture/layers.md` for review with the professor ([#4](https://github.com/Hexablock-Suite/hexablock-api/pull/4)), with the interfaces the brief names ([#6](https://github.com/Hexablock-Suite/hexablock-api/pull/6)).
- Backend requirements view in `docs/REQUIREMENTS.md` ([#2](https://github.com/Hexablock-Suite/hexablock-api/pull/2)).
- Repository bootstrap ([#1](https://github.com/Hexablock-Suite/hexablock-api/pull/1)): NestJS 12 on the Vite+ toolchain with a health endpoint, Swagger docs and the layer skeleton, the test name, Clean layer and deterministic core gates, commit hooks, `pnpm verify` and the CI workflow, the README, AI usage and agent rules skeletons, the committed OpenAPI document with a drift check, the contract CI job against the client pact, and the Drizzle harness on Postgres and in-memory PGlite.

### Changed

- The layer diagram is fixed after the draft audit ([#7](https://github.com/Hexablock-Suite/hexablock-api/pull/7)).
- The Drizzle schema moves into the persistence adapter ([#5](https://github.com/Hexablock-Suite/hexablock-api/pull/5)).
- Q2 is closed with the team's backend scope decision ([#3](https://github.com/Hexablock-Suite/hexablock-api/pull/3)).
