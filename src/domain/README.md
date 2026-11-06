# domain

Entities, value objects and domain services. Imports only other files in `src/domain`; no framework, ORM, driver or system clock. The ports live in `src/application`, so domain code never imports them: it takes the current instant as a parameter.

`progress/` holds the `PlayerProgress` aggregate root, one per `userId` and `gameId` (API-FR-02), with its value objects `UserId`, `GameId` and `LevelResult`. A broken rule throws `ProgressError`.
