# Changelog

All notable changes to this repository are documented in this file. The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

Each sprint of the plan in [`hexablock-app/docs/ROADMAP.md`](https://github.com/Hexablock-Suite/hexablock-app/blob/main/docs/ROADMAP.md) closes with a version section and a `v0.N.0` tag, the same tag as the app (rule R-sprint-release in `AGENTS.md`). The final delivery is `v1.0.0`.

## [Unreleased]

### Added

- Two more use case flows in `docs/architecture/flows.md`, each with a class view and a UML sequence diagram: login, with its unknown-user and wrong-password branches, and update levels, with the `LevelValidators` Strategy registry; a table names the path that each other use case follows ([#27](https://github.com/Hexablock-Suite/hexablock-api/pull/27)).
- A use case flow page, `docs/architecture/flows.md`, with a class view and a UML sequence diagram of the sync progress endpoint across the four layers ([#27](https://github.com/Hexablock-Suite/hexablock-api/pull/27)).

### Changed

- `docs/REQUIREMENTS.md` §4 adds two offline sync rules that the team closed on 2026-11-06. DS-11: the level copy with the higher `version` wins, so a level update reaches players only when it raises `version`. DS-12: the level results table keeps the best result per user, game and level, and the high score keeps the highest value. DS-12 closes the every-attempt question of DS-4; the order that defines the best result stays open in DS-4.
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
