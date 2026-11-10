# domain

Entities, value objects and domain services. Imports only other files in `src/domain`; no framework, ORM, driver or system clock. The ports live in `src/application`, so domain code never imports them: it takes the current instant as a parameter.

`progress/` holds the `PlayerProgress` aggregate root, one per `userId` and `gameId` (API-FR-02), with its value objects `UserId`, `GameId`, `Score` and `LevelResult`. A `LevelResult` holds a `LevelId`, a `Stars`, a `Moves` and an `ElapsedTime` value object. A broken rule throws `ProgressError`.

`user/` holds the `User` entity and its value objects. `Username` and `Password` check their length with the `USERNAME_LENGTH` and `PASSWORD_LENGTH` ranges, which the HTTP adapters also read. `shared/` holds `Result<T, E>` and the generic `Range<T>`.
