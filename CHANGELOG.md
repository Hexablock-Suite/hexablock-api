# Changelog

All notable changes to this repository are documented in this file. The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

Each sprint of the plan in [`hexablock-app/docs/ROADMAP.md`](https://github.com/Hexablock-Suite/hexablock-app/blob/main/docs/ROADMAP.md) closes with a version section and a `v0.N.0` tag, the same tag as the app (rule R-sprint-release in `AGENTS.md`). The final delivery is `v1.0.0`.

## [Unreleased]

### Added

- This changelog, rule R-sprint-release and its gate `test/gates/changelog.gate.spec.ts`.
- Numbered functional and non-functional requirements, API-FR-n and API-NFR-n, each with a check ([#8](https://github.com/Hexablock-Suite/hexablock-api/pull/8)).
- Draft layer diagram in `docs/architecture/layers.md` for review with the professor ([#4](https://github.com/Hexablock-Suite/hexablock-api/pull/4)), with the interfaces the brief names ([#6](https://github.com/Hexablock-Suite/hexablock-api/pull/6)).
- Backend requirements view in `docs/REQUIREMENTS.md` ([#2](https://github.com/Hexablock-Suite/hexablock-api/pull/2)).
- Repository bootstrap ([#1](https://github.com/Hexablock-Suite/hexablock-api/pull/1)): NestJS 12 on the Vite+ toolchain with a health endpoint, Swagger docs and the layer skeleton, the test name, Clean layer and deterministic core gates, commit hooks, `pnpm verify` and the CI workflow, the README, AI usage and agent rules skeletons, the committed OpenAPI document with a drift check, the contract CI job against the client pact, and the Drizzle harness on Postgres and in-memory PGlite.

### Changed

- The layer diagram is fixed after the draft audit ([#7](https://github.com/Hexablock-Suite/hexablock-api/pull/7)).
- The Drizzle schema moves into the persistence adapter ([#5](https://github.com/Hexablock-Suite/hexablock-api/pull/5)).
- Q2 is closed with the team's backend scope decision ([#3](https://github.com/Hexablock-Suite/hexablock-api/pull/3)).
