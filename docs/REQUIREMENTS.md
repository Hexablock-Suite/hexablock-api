# Requirements (backend view)

This file holds the backend requirements, written in our own words. The canonical document for the whole project, with the variation register, every assumption and every question for the professor, is [`hexablock-app/docs/REQUIREMENTS.md`](https://github.com/Hexablock-Suite/hexablock-app/blob/main/docs/REQUIREMENTS.md). Keep the IDs (A#, Q#, C#) the same in both files.

- **Source:** the course statement "Proyecto Semestral — HexaBlock Suite", version 1.0, issued 2026-10-23. It is not redistributed in this repository. Each item cites its section as `§n`.
- **Rule:** when a backend requirement, an assumption or an answer from the professor changes, update this file and the canonical one in the same pair of pull requests.

## 1. What the backend serves (§2, §5.2)

A REST API that manages users, progress, scores and level definitions for the four variants: Hexa Lines, Hexa Fit, Hexa Sort and Hexa Merge. Every variant is identified by a `gameId`.

Required:

1. Sign-up and sign-in with JWT (§5.2.1).
2. Progress sync with `gameId` as a required key: one progress entry per user and per variant (§5.2.2).
3. A global leaderboard per `gameId` and, for the level-based variants (Fit and Sort), per level (§5.2.3).
4. Read and update the level definitions of Fit and Sort, so new levels reach players without an app update. One generic level schema, with a section specific to each `gameId` (§5.2.4).
5. API documentation with Swagger/OpenAPI (§5.2.5).
6. Consistent HTTP error responses (§5.2.6).

## 2. Quality requirements that reach the backend

- **Tests (§3.6):** unit tests with mocks or stubs; integration tests of use cases with real repositories on an in-memory database; endpoint tests with an HTTP test client, including filtering by `gameId`; save and load progress end to end for each variant; Pact contract tests (recommended); CI on every pull request. Names follow `should_[result]_when_[condition]` with Arrange-Act-Assert.
- **SOLID (§3.2)** applies to all project code; each principle used has a README example from this repo.
- **AOP (§3.5):** aspects are decorators or proxies over use cases, never inside business code.
- **README (§6.1), commits (§6.2) and `AI_USAGE.md` (§7)** are required in this repository too.
- **Clean Architecture, GoF patterns and diagrams (§3.3, §3.4, §4):** see A9 and Q2.

## 3. Assumptions that shape the API

- **A5 — Fit levels can be won.** Every Fit level carries the designer's solution (piece, rotation in 60° steps, position). The level update endpoint rejects a Fit level when its pieces do not have the same total area as the figure, or when the stored solution does not cover the figure exactly without overlaps. Pieces rotate; they are never mirrored.
- **A6 — Level origin.** The app always ships its own levels and works offline; levels from this API add to them or replace them. The API is not required for a first launch.
- **A7 — Public repositories.** This repository is public.
- **A9 — Backend scope.** Until Q2 is answered, this backend follows Clean Architecture, SOLID, the patterns where they fit naturally, and has its own class and layer diagrams in `docs/`.

## 4. Data shape decisions still open (team)

- How one progress entry per user and variant (§5.2.2) also holds per-level results, and how the per-level leaderboard (§5.2.3) reads them.
- What orders the per-level leaderboard for Fit (stars, moves, time) and for Sort; scoring is defined by the team (§5.1.6).
- The generic level schema: the common part, and the `gameId` section for Fit (figure, pieces, solution) and for Sort (board, goals, piece source).

## 5. Questions for the professor that touch the backend

- **Q2:** Must the backend also meet the generics, GoF patterns, `EXTENSIBILITY.md` and the three diagrams, or only the client?
- **Q4:** Who may update level definitions? The statement asks only for sign-up and sign-in, with no roles.
- **C1:** Do you expect the system to check that a Fit level can be won? (A5)
- **C6:** Are public repositories acceptable? (A7)
