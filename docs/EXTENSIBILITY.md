# Extending the API

This guide lists, for each extension axis of the [extensibility diagram](architecture/extensibility.md), the class that you add and the file that registers it. The diagram shows why each axis leaves the core unchanged. This guide does not repeat the views: read [view 1](architecture/extensibility.md#view-1-the-core-and-its-extension-axes) for every axis, [view 2](architecture/extensibility.md#view-2-a-new-variant) for a new variant, and the [scenarios](architecture/extensibility.md#scenarios) for a new database engine, a second protocol and another web framework. The table [Extension points](architecture/extensibility.md#extension-points) lists what each axis does not change.

One file registers almost every extension: [`src/infrastructure/app.module.ts`](../src/infrastructure/app.module.ts), the composition root. It binds each port to its adapter, fills `LevelValidators` and `Topologies` in `levelValidators()`, and lists the HTTP controllers.

Before you add a class, read the layer rules in [`AGENTS.md`](../AGENTS.md) and the section [Domain design rules](architecture/classes.md#domain-design-rules) of the class diagram. `pnpm verify` runs the gates that check them.

## A variant with level files

The example of the statement is a fifth variant, Fill (§3.1). `FillSection` and `FillLevelValidator` are placeholders: no code holds them.

A variant with level files adds two domain classes (its section and its validator), one entry in `levelValidators()` of `src/infrastructure/app.module.ts` and one section DTO in `src/adapters/http/level.dto.ts`. The section DTO is a change of the HTTP adapter. The core does not change.

- **Add:** a section type in its own folder of `src/domain/level/`, as [`FitSection`](../src/domain/level/fit/fit-section.ts) and [`SortSection`](../src/domain/level/sort/sort-section.ts). It checks its own shape and holds its own rules. A datum can break its rules, so its factory returns a `Result`. A value object of the section that no datum can fail returns the value itself (rule «One failure mechanism» of the [Domain design rules](architecture/classes.md#domain-design-rules), decided on [#139](https://github.com/Hexablock-Suite/hexablock-api/issues/139)).
- **Add:** a class that implements [`LevelValidator<TSection>`](../src/domain/level/level-validator.ts), as [`SortLevelValidator`](../src/domain/level/sort/sort-level-validator.ts). It only picks the section type of its game and holds no rule.
- **Register:** one `[GameId, validator]` entry in `levelValidators()` of [`app.module.ts`](../src/infrastructure/app.module.ts). [`LevelValidators.of()`](../src/domain/level/level-validators.ts) throws a `RangeError` when two entries name one `gameId`.
- **Document the HTTP schema:** `LevelDto.section` in [`level.dto.ts`](../src/adapters/http/level.dto.ts) is a `oneOf` of `FitSectionDto` and `SortSectionDto`. Add a section DTO there and add it to that `oneOf` and to `@ApiExtraModels`, so that the OpenAPI schema describes the new section, then run `pnpm openapi:export`. `LevelDtoMapper` keeps each section as it arrives, so it does not change.
- **Test:** as [`sort-section.spec.ts`](../test/domain/level/sort-section.spec.ts), [`sort-level-validator.spec.ts`](../test/domain/level/sort-level-validator.spec.ts) and [`level-validators.spec.ts`](../test/domain/level/level-validators.spec.ts) do.

## A variant with no level files

A variant with no level files, as Lines and Merge, adds nothing. `GameId` is an open value object, and every use case takes `gameId` as a parameter. `LevelValidators.check()` gives `game-without-levels` for a game with no entry (API-FR-04).

## A topology

- **Add:** a class that implements [`Topology`](../src/domain/level/topology.ts), as [`HexTopology`](../src/domain/level/hex-topology.ts), [`SquareTopology`](../src/domain/level/square-topology.ts) and [`TriangleTopology`](../src/domain/level/triangle-topology.ts) do. It says which coordinates are its cells (`holds()`), how a rotation turns a cell (`turn()`) and how the offset of a placement moves a cell (`move()`).
- **Register:** one `[TopologyId, topology]` entry in the `Topologies.of()` list inside `levelValidators()` of [`app.module.ts`](../src/infrastructure/app.module.ts). [`Topologies.of()`](../src/domain/level/topologies.ts) throws a `RangeError` when two entries name one topology. A level whose `topology` has no entry gives `unknown-topology`.
- **Test:** as [`topology.spec.ts`](../test/domain/level/topology.spec.ts) does for `HexTopology`, `SquareTopology` and `TriangleTopology`.

## A database engine

The scenario [Database engine](architecture/extensibility.md#database-engine) names MongoDB (§8). The `Mongo` classes are placeholders: no code holds them.

- **Add:** one class per output port in `src/adapters/persistence/`, as the Drizzle adapters do: [`UserRepository`](../src/application/ports/user-repository.ts) ([`DrizzleUserRepository`](../src/adapters/persistence/drizzle-user-repository.ts)), [`ProgressRepository`](../src/application/ports/progress-repository.ts) ([`DrizzleProgressRepository`](../src/adapters/persistence/drizzle-progress-repository.ts)), [`LevelRepository`](../src/application/ports/level-repository.ts) ([`DrizzleLevelRepository`](../src/adapters/persistence/drizzle-level-repository.ts)), and [`GlobalBoardReader`](../src/application/ports/global-board-reader.ts) with [`LevelBoardReader`](../src/application/ports/level-board-reader.ts), which one class may implement together, as [`DrizzleLeaderboardReader`](../src/adapters/persistence/drizzle-leaderboard-reader.ts) does. These classes never import `@nestjs/*` or `src/infrastructure` (rules R-persistence-no-nest and R-adapters-no-infrastructure). The level adapter takes `LevelValidators` to restore each stored level, as `DrizzleLevelRepository` does.
- **Register:** the connection in [`database.module.ts`](../src/infrastructure/database/database.module.ts), which provides `DATABASE` from [`connection.ts`](../src/infrastructure/database/connection.ts). Then the `useFactory` of `USER_REPOSITORY`, `PROGRESS_REPOSITORY` and `LEVEL_REPOSITORY`, and the provider of `DrizzleLeaderboardReader`, in [`app.module.ts`](../src/infrastructure/app.module.ts). `GLOBAL_BOARD_READER` and `LEVEL_BOARD_READER` are aliases of that provider, so both follow it.
- **Test:** run the shared contract suites on the new adapters, as the Drizzle tests in [`test/integration/`](../test/integration/) do: `describeUserRepositoryContract` in [`user-repository.contract.ts`](../test/support/user-repository.contract.ts), `describeProgressRepositoryContract` in [`progress-repository.contract.ts`](../test/support/progress-repository.contract.ts) `describeLevelRepositoryContract` in [`level-repository.contract.ts`](../test/support/level-repository.contract.ts), `describeGlobalBoardReaderContract` in [`global-board-reader.contract.ts`](../test/support/global-board-reader.contract.ts) and `describeLevelBoardReaderContract` in [`level-board-reader.contract.ts`](../test/support/level-board-reader.contract.ts). [`drizzle-leaderboard-reader.spec.ts`](../test/integration/drizzle-leaderboard-reader.spec.ts) runs both board reader suites on the Drizzle reader.

In the frame `DATABASE ENGINE · ADAPTER`, the ports keep `«interface»` `«port»`. `«port»` marks a layer, not a role of the pattern (decided on [#139](https://github.com/Hexablock-Suite/hexablock-api/issues/139), «How to read it» of the [class diagram](architecture/classes.md#how-to-read-it)).

## A driver

View 1 draws four driver ports. Each one has one adapter in a folder of `src/adapters/` named for the library that it adapts (#212, option C):

| Port                                                            | Adapter                                                                    | Binding           |
| --------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------- |
| [`Clock`](../src/application/ports/clock.ts)                    | [`SystemClock`](../src/adapters/clock/system-clock.ts)                     | `CLOCK`           |
| [`Logger`](../src/application/ports/logger.ts)                  | [`NestLogger`](../src/adapters/logging/nest-logger.ts)                     | `LOGGER`          |
| [`PasswordHasher`](../src/application/ports/password-hasher.ts) | [`ScryptPasswordHasher`](../src/adapters/crypto/scrypt-password-hasher.ts) | `PASSWORD_HASHER` |
| [`TokenIssuer`](../src/application/ports/token-issuer.ts)       | [`JwtTokenIssuer`](../src/adapters/jwt/jwt-token-issuer.ts)                | `TOKEN_ISSUER`    |

- **Add:** a class in `src/adapters/<library>/` that implements the port, and a rule in [`.dependency-cruiser.cjs`](../.dependency-cruiser.cjs) for that folder before it imports its library (rule R-other-adapters-no-package of [`AGENTS.md`](../AGENTS.md)).
- **Register:** change the provider of its binding in [`app.module.ts`](../src/infrastructure/app.module.ts) to the new class.
- **Test:** a new clock runs `describeClockContract` of [`clock.contract.ts`](../test/support/clock.contract.ts), as [`clock.contract.spec.ts`](../test/support/clock.contract.spec.ts) does for `SystemClock`. The tests of the other adapters are in [`test/unit/adapters/`](../test/unit/adapters/).

In the frame `DRIVERS · ADAPTER`, the ports keep `«interface»` `«port»`, as in the database engine frame.

## An aspect

- **Add:** a subclass of [`UseCaseAspect`](../src/application/aspects/use-case-aspect.ts) in `src/application/aspects/`, as [`LoggingAspect`](../src/application/aspects/logging-aspect.ts). It overrides `execute()` and adds its concern around `super.execute()`. It is a plain class, not a Nest interceptor (rule R-application-pure). `LoggingAspect` is the only aspect in the code.
- **Register:** wrap the use case in its provider in [`app.module.ts`](../src/infrastructure/app.module.ts), as `LoggingAspect` wraps the nine use cases `RegisterUseCase`, `LoginUseCase`, `AuthenticateTokenUseCase`, `SyncProgressUseCase`, `GetProgressUseCase`, `GetLevelsUseCase`, `UpdateLevelsUseCase`, `GetGlobalLeaderboardUseCase` and `GetLevelLeaderboardUseCase`. The use case does not change.
- **Test:** as [`logging-aspect.spec.ts`](../test/unit/application/logging-aspect.spec.ts) does: wrap a fake use case and check that the response does not change.

## An HTTP controller

- **Add:** a controller in `src/adapters/http/` that injects the input ports it calls, as [`LevelsController`](../src/adapters/http/levels.controller.ts) injects `GET_LEVELS` and `UPDATE_LEVELS`. A DTO mapper holds the translation, so the controller holds none (see [`src/adapters/http/README.md`](../src/adapters/http/README.md)).
- **Register:** add the class to `controllers` in [`app.module.ts`](../src/infrastructure/app.module.ts). Then run `pnpm openapi:export` and commit `openapi/openapi.json`.
- **Test:** an e2e test that starts the app with `createTestApp()` of [`test-app.ts`](../test/support/http/test-app.ts), as [`levels.e2e-spec.ts`](../test/levels.e2e-spec.ts) does.
