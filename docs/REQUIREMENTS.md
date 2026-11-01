# Requirements (backend view)

This file holds the backend requirements, written in our own words. The canonical document for the whole project, with the variation register, every assumption and every question for the professor, is [`hexablock-app/docs/REQUIREMENTS.md`](https://github.com/Hexablock-Suite/hexablock-app/blob/main/docs/REQUIREMENTS.md). Keep the IDs (A#, Q#, C#) the same in both files.

- **Source:** the course statement "Proyecto Semestral — HexaBlock Suite", version 1.0, issued 2026-10-23. It is not redistributed in this repository. Each item cites its section as `§n`.
- **Requirement IDs:** **API-FR-n** is a functional requirement: what the API serves. **API-NFR-n** is a non-functional requirement: how the backend is built, tested and documented. The client uses APP-FR-n and APP-NFR-n; its APP-FR-12 to APP-FR-15 are the client side of API-FR-01 to API-FR-04. An ID never changes; a dropped requirement keeps its ID and says "Dropped".
- **Checks:** each requirement ends with _Check_, the evidence that shows it is met. Where a gate already exists, the check names it. The other checks are a proposal of 2026-10-30 for the team to review.
- **Rule:** when a backend requirement, an assumption or an answer from the professor changes, update this file and the canonical one in the same pair of pull requests.

| Kind                                                 | IDs                      | Sections |
| ---------------------------------------------------- | ------------------------ | -------- |
| Functional: what the API serves                      | API-FR-01 to API-FR-06   | §1       |
| Non-functional: how the backend is built and checked | API-NFR-01 to API-NFR-14 | §2       |

## 1. What the backend serves (functional, §2, §5.2)

A REST API that manages users, progress, scores and level definitions for the four variants: Hexa Lines, Hexa Fit, Hexa Sort and Hexa Merge. Every variant is identified by a `gameId`.

API-FR-01 to API-FR-06 keep the numbers of statement §5.2.

- **API-FR-01 — Sign-up and sign-in (§5.2.1).** Sign-up and sign-in with JWT. _Check:_ an e2e test signs up, signs in and calls a protected endpoint with the token; the same call without a token gets 401.
- **API-FR-02 — Progress sync (§5.2.2).** Progress sync with `gameId` as a required key: one progress entry per user and per variant. _Check:_ an endpoint test saves progress for two variants and reads back two entries; a second save for the same user and variant does not add an entry; a request without `gameId` is rejected.
- **API-FR-03 — Leaderboard (§5.2.3).** A global leaderboard per `gameId` and, for the level-based variants (Fit and Sort), per level. _Check:_ an endpoint test filters by `gameId` and by level. What orders the per-level leaderboard is still open (§4).
- **API-FR-04 — Level definitions (§5.2.4).** Read and update the level definitions of Fit and Sort, so new levels reach players without an app update. One generic level schema, with a section specific to each `gameId`. _Check:_ an endpoint test reads the levels of each `gameId`, and the update rejects a Fit level that fails A5. Who may update levels is Q4.
- **API-FR-05 — API documentation (§5.2.5).** API documentation with Swagger/OpenAPI. _Check:_ `pnpm openapi:export` writes `openapi/openapi.json`, and `test/health.e2e-spec.ts` fails when the committed file differs from the code (rule R-openapi-drift).
- **API-FR-06 — HTTP errors (§5.2.6).** Consistent HTTP error responses. _Check:_ e2e tests for a validation error, a missing token and a missing resource get the same body shape.

## 2. Quality requirements that reach the backend (non-functional)

- **API-NFR-01 — Unit tests (§3.6).** Unit tests with mocks or stubs. Names follow `should_[result]_when_[condition]` with Arrange-Act-Assert. _Check:_ gate `test/gates/test-name.gate.spec.ts` (rule R-test-names).
- **API-NFR-02 — Integration tests (§3.6).** Integration tests of use cases with real repositories on an in-memory database. _Check:_ repository tests run on PGlite through `test/support/test-database.ts`, and gate `test/integration/in-memory-database.spec.ts` covers the harness (rule R-database-harness).
- **API-NFR-03 — Endpoint tests (§3.6).** Endpoint tests with an HTTP test client, including filtering by `gameId`; save and load progress end to end for each variant. _Check:_ the e2e suite has one save-and-load test per variant.
- **API-NFR-04 — Contract tests (§3.6).** Pact contract tests (recommended). _Check:_ the CI `contract` job runs `scripts/contract/verify-provider.js` against the client's pact (rule R-contract).
- **API-NFR-05 — CI (§3.6).** CI on every pull request. _Check:_ the CI `verify` job runs on every pull request, and gate `test/gates/ci-contract.spec.ts` keeps it in step with `pnpm verify` (rule R-verify-parity).
- **API-NFR-06 — SOLID (§3.2).** SOLID applies to all project code; each principle used has a README example from this repo. _Check:_ the README section "SOLID Principles" has one example per principle with a link to its file.
- **API-NFR-07 — AOP (§3.5).** Aspects are decorators or proxies over use cases, never inside business code. _Check:_ gate `test/gates/architecture.gate.spec.ts` keeps Nest out of `src/application` (rule R-application-pure), and a test shows the aspect runs while the use case it wraps has none of its code.
- **API-NFR-08 — Clean Architecture (§3.4).** Required here too. See decision D6 in the client requirements. _Check:_ `pnpm arch` and gate `test/gates/architecture.gate.spec.ts` (rules R-domain-pure, R-application-pure, R-persistence-no-nest, R-adapters-no-infrastructure); the layer diagram is in [`architecture/layers.md`](architecture/layers.md).
- **API-NFR-09 — GoF patterns (§3.3).** Required here too: the patterns the design needs, each one justified. See decision D7 in the client requirements. _Check:_ the README section "Design Patterns" lists each pattern used with its justification and a link to its file.
- **API-NFR-10 — Diagrams and extensibility (§4).** Required here too: the class and layer diagrams and `EXTENSIBILITY.md` in `docs/` (D6). _Check:_ [`architecture/layers.md`](architecture/layers.md) holds the layer diagram and [`architecture/classes.md`](architecture/classes.md) holds the class diagram; [`architecture/extensibility.md`](architecture/extensibility.md) holds the extensibility diagram; `docs/EXTENSIBILITY.md` is still to write.
- **API-NFR-11 — Reproducible core (D6).** `src/application` reads time from the `Clock` port in `src/application/ports/clock.ts`, and `src/domain` takes the instant as a parameter, because ports live in the application layer and the domain never imports it. Both layers take randomness from an injected seeded source. _Check:_ gate `test/gates/determinism.gate.spec.ts` (rule R-deterministic-core).
- **API-NFR-12 — README (§6.1).** The README is required in this repository too. _Check:_ gate `test/gates/docs-skeleton.spec.ts` (rule R-docs-skeleton).
- **API-NFR-13 — Commits (§6.2).** Conventional Commits are required in this repository too. _Check:_ `commitlint.config.cjs`, the commit-msg hook and gate `test/gates/commit-message.gate.spec.ts` (rule R-conventional-commits).
- **API-NFR-14 — AI usage (§7).** `AI_USAGE.md` is required in this repository too. _Check:_ no gate (rule R-ai-usage-log); each pull request adds its entry.

## 3. Assumptions that shape the API

- **A5 — Fit levels can be won.** Every Fit level carries the designer's solution (piece, rotation, position). The rotation counts steps of the level's topology, never degrees: the hexagonal topology has six steps of 60°, and another topology gives its own steps (D4). The level update endpoint rejects a Fit level when its pieces do not have the same total area as the figure, or when the stored solution does not cover the figure exactly without overlaps. Pieces rotate; they are never mirrored.
- **A6 — Level origin.** The app always ships its own levels and works offline; levels from this API add to them or replace them. The API is not required for a first launch.
- **A7 — Public repositories.** This repository is public.
- **A9 — Backend scope.** Replaced on 2026-10-26 by the client's D6: this backend meets the same standards as the client (generics, SOLID, Clean Architecture, the patterns it needs, `EXTENSIBILITY.md` and its own class and layer diagrams in `docs/`). The class diagram exists since 2026-10-31: [`architecture/classes.md`](architecture/classes.md). The extensibility diagram exists since 2026-10-31: [`architecture/extensibility.md`](architecture/extensibility.md).

## 4. Data shape decisions (team)

- **DS-5 — Progress shape (§5.2.2, §5.2.3).** Closed by the team on 2026-10-30 with option «B · Dos tablas»: one progress row per `userId` and `gameId`, and a level results table with `userId`, `gameId`, `levelId`, `stars`, `moves` and `elapsedMs`. The per-level leaderboard reads the level results table. In the domain, `PlayerProgress` is the aggregate root and keeps its level results; one repository saves both tables. See [`architecture/classes.md`](architecture/classes.md), views 1.1 and 3.1.
- **DS-4 — Leaderboard order (§5.2.3).** Open. What orders the per-level leaderboard for Fit (stars, moves, time) and for Sort; scoring is defined by the team (§5.1.6). It also decides whether the level results table keeps every attempt or only the best one.
- **DS-6 — Level schema (§5.2.4).** Closed by the team on 2026-10-30 with option «A · Común + sección tipada»: a common part (`gameId`, `levelId`, `order`, `version`, `topology`) and a typed section per `gameId`, validated per variant. The Fit section has `figure`, `pieces` and `witness` (the solution of A5). The Sort section has `radius`, `goals` and `source`. The API rejects a Fit level that fails A5 (API-FR-04). The Fit check reads the rotation steps from the topology that the `topology` field names, so the API accepts a level of any topology that the code knows; it does not reject a topology only because it is not hexagonal. See [`architecture/classes.md`](architecture/classes.md), views 1.2 and 2.3, decision 6.

## 5. Questions for the professor that touch the backend

- **Q2:** Closed by the team on 2026-10-26: the backend meets the same standards (client D6).
- **Q4:** Who may update level definitions? The statement asks only for sign-up and sign-in, with no roles.
- **Q10:** Closed in the class of 2026-10-30: the ports live in the application layer, in `src/application`, as §3.4 says. The `Clock` port moved to `src/application/ports/clock.ts` on 2026-10-31. See Q10 in [`architecture/layers.md`](architecture/layers.md).
- **Q11:** Closed by the team on 2026-10-30: the Drizzle schema lives in `src/adapters/persistence/schema.ts`, next to the repositories that query it.
- **Q12:** Where do the AOP aspects live: in `src/application` as a plain decorator over a logger port, or in `src/infrastructure` as a wrapper that the Nest modules apply? See Q12 in [`architecture/layers.md`](architecture/layers.md).
- **C1:** Do you expect the system to check that a Fit level can be won? (A5)
- **C6:** Are public repositories acceptable? (A7)
