# Use case flows

Status: draft for team review, 2026-11-04.

This page shows how a use case crosses the four Clean layers of the API. It draws one pair of views for each path that shows something new, and the table [Other use cases](#other-use-cases) names the path that each other use case follows. In the class of 2026-11-03 the professor asked to see a pair of use cases and how the layers interact in each. He wanted to see how the product talks to the backend. Each use case here has two views with the same class names:

- A class view of the use case only. It draws every class of the slice, from the controller to the domain, in the layer bands of [classes.md](classes.md).
- A UML sequence diagram. It shows the calls in time order, from the HTTP request that enters the API to the HTTP response.

The layers themselves are in [layers.md](layers.md). The full class diagram is in [classes.md](classes.md).

## Use case 1: sync progress

The app calls this endpoint when it syncs its progress and its leaderboard: `SaveProgress` in `hexablock-app` sends the progress through its `ApiProgressRepository`. The endpoint is `ProgressController.sync()` (API-FR-02). It is the only endpoint that receives data from the app on each game, and it crosses three layers: a guard, a controller, a mapper and the adapters of its ports in layer 3, a use case and its ports in layer 2, and the progress aggregate in layer 1.

### Class view

![Sync progress class view: JwtAuthGuard, ProgressController, ProgressDtoMapper and DrizzleProgressRepository and SystemClock in layer 3, SyncProgressUseCase with the SyncProgress and AuthenticateToken input ports, SyncProgressRequest, which holds its LevelResult values through a use arrow results 0..*, and the ProgressRepository and Clock ports in layer 2, and PlayerProgress, ProgressKey, LevelResult and SyncInstant in one dashed Aggregate frame in layer 1](classes/views/flow-1-sync-progress.png)

### Sequence diagram

![Sync progress sequence: the HTTP request enters JwtAuthGuard, ProgressController builds a SyncProgressRequest and calls SyncProgress, SyncProgressUseCase creates the ProgressKey of the request and calls ProgressRepository.update(key, change) once, the update(userId, gameId, change) call of the diagrams task with a key that holds the userId and the gameId; DrizzleProgressRepository locks the key, reads the stored PlayerProgress and calls the change back, which reads the SyncInstant of SystemClock, starts the PlayerProgress when none is stored, records the score and each LevelResult and returns it; the adapter saves it in the same transaction, and the controller answers with a ProgressDto](flows/views/seq-1-sync-progress.png)

The code runs the find, the change and the save of this view as one call, `ProgressRepository.update(key, change)`. The key is the `ProgressKey` that the use case builds from the `userId` and the `gameId` of the request ([#107](https://github.com/Hexablock-Suite/hexablock-api/issues/107)). The key holds the `userId` and the `gameId`, so this one call is the `update(userId, gameId, change)` call of the diagrams task ([#22](https://github.com/Hexablock-Suite/hexablock-api/issues/22)) with the identity type of #107, and it replaces `find()` and `save()`. `DrizzleProgressRepository` opens one transaction, takes a Postgres advisory lock for the key, on the text `<userId>:<gameId>` that it receives from the key, reads the aggregate and passes it, or `null`, to the change. The change reads the `SyncInstant` of `Clock.now()` first, then starts or changes the `PlayerProgress` at that instant. The adapter saves what the change returns in the same transaction. So two overlapping syncs of one key run one after the other, and no level result is lost. `updatedAt` never moves back: each record of a score or a level result moves it to the instant of its sync, and the aggregate keeps the latest instant (decision 3 of [classes.md](classes.md)). A row lock is not enough, because the first sync of a game has no row yet. The sequence diagram draws the change as a call back from the adapter into the use case, with an activation of its own.

A token whose user has no stored row gets a 401, not a 500 ([#137](https://github.com/Hexablock-Suite/hexablock-api/issues/137), decision of 2026-11-17). The check lives in `AuthenticateTokenUseCase`, which the guard already calls: after `TokenIssuer.verify()` it asks `UserRepository.exists()`, so every guarded route, `GET /v1/auth/me` too, answers 401 with the `ErrorDto` body and the message of a bad token. It costs one query per guarded request. The user can still go between the guard and the write. Then the foreign key `progress.user_id → users.id` rejects the write with Postgres code 23503, the transaction rolls back, and `update()` returns the failed `Result` `unknown-user`. `SyncProgressUseCase` returns it as the `ProgressProblem` `{ kind: 'unknown-user' }`, and `ProgressController` answers it with the same 401 as the guard. The sync stores nothing.

## Use case 2: login

The app calls this endpoint when a player signs in. The endpoint is `AuthController.signIn()` (API-FR-01). Its path is new in two ways. First, it has no guard, because the player has no token yet. Second, the use case holds three ports, and all three adapters live in layer 3: `ScryptPasswordHasher` checks the password and `JwtTokenIssuer` issues the `SessionToken` that every guarded request then carries. The use case answers no in two places, an unknown username and a wrong password, so the sequence diagram has two `alt` fragments. `AuthDtoMapper` builds the `LoginRequest` from the body: a `Username` and a `PasswordAttempt` ([#105](https://github.com/Hexablock-Suite/hexablock-api/issues/105)). A username that breaks its rule stops in the mapper with the 401 of a wrong password. The use case asks `isLongerThanAnyPassword()` before any port call ([#98](https://github.com/Hexablock-Suite/hexablock-api/issues/98)). It never opens the `User`: it asks `user.passwordMatches()` with the attempt and the `PasswordHasher` port, the user passes its own hash to `verify()`, and `TokenIssuer.issue()` takes the `User` (decision 16 of [classes.md](classes.md)).

### Class view

![Login class view: ScryptPasswordHasher, JwtTokenIssuer, AuthController, AuthDtoMapper and DrizzleUserRepository in layer 3, LoginUseCase with the Login input port, the LoginRequest that AuthDtoMapper builds, which holds its PasswordAttempt through a use arrow attempt 1, and the UserRepository, PasswordHasher and TokenIssuer ports in layer 2, and the User aggregate root in a dashed Aggregate frame, the PasswordAttempt value object of the request and the PasswordVerifier interface in layer 1](classes/views/flow-2-login.png)

### Sequence diagram

![Login sequence: the HTTP request enters AuthController with no token, the controller calls Login with the LoginRequest that AuthDtoMapper builds, LoginUseCase finds the User through DrizzleUserRepository, asks ScryptPasswordHasher for one check against a dummy hash and answers a failure when the user is missing, otherwise asks the User if the PasswordAttempt matches, the User passes its own hash to ScryptPasswordHasher, the use case answers a failure when the password does not match, and otherwise asks JwtTokenIssuer for a SessionToken, which the controller answers as a TokenDto](flows/views/seq-2-login.png)

## Use case 3: update levels

A signed-in client calls this endpoint to publish new levels without an app update. Q4 changed on 2026-11-16 ([#134](https://github.com/Hexablock-Suite/hexablock-api/issues/134)) and 2026-11-17 ([#145](https://github.com/Hexablock-Suite/hexablock-api/issues/145)): after the token guard, `LevelEditorGuard` lets only an account in the list of level editors of the configuration update, with no roles, and answers 403 to any other account before the controller reads the body (decision 18 of [classes.md](classes.md)). The class view and the sequence diagram of this use case name that guard in a note and do not draw it. The endpoint is `LevelsController.update()`, `PUT /v1/levels` (API-FR-04). Its path is new because it makes the Strategy of §3.3 visible: `LevelValidators` is a domain service that holds one `LevelValidator` per `gameId`, and `FitLevelValidator` and `SortLevelValidator` implement it. The strategy only picks the section type, the section checks its own shape and holds its rules, and `LevelValidators` creates each level, so no level exists before its section is valid (decisions 4 and 5 of [classes.md](classes.md)). The use case checks every level before it saves any level, so the sequence diagram has a `loop` over the levels and an `alt` that saves the levels one by one or returns the problems. No class of layer 4 takes part.

### Class view

![Update levels class view: JwtAuthGuard, LevelsController, LevelDtoMapper and DrizzleLevelRepository, which holds LevelValidators through a use arrow validators 1, in layer 3, UpdateLevelsUseCase with the AuthenticateToken and UpdateLevels input ports and LevelUpdater, the role of the LevelRepository port that it holds, with update, under LevelRepository, which extends it and which DrizzleLevelRepository implements (decision 23), in layer 2, and the LevelValidators domain service with its LevelValidator strategies FitLevelValidator, which holds Topologies, and SortLevelValidator and the LevelDefinition aggregate root in a dashed Aggregate frame in layer 1; notes say that a level that fails its check leaves the stored levels unchanged, that each save asks decideReplace() of the incoming level (S3-10, #174), that FitSection and SortSection are value objects of the aggregate of LevelDefinition and that LevelValidator and its validators form the Strategy pattern, and name Coordinate, one cell of a FitSection](classes/views/flow-3-update-levels.png)

### Sequence diagram

![Update levels sequence: JwtAuthGuard verifies the token, LevelsController builds the request with LevelDtoMapper and calls UpdateLevels, the use case asks LevelValidators to check each level, the LevelValidator strategy of its gameId picks the section type and LevelValidators builds the level, a note gives the Fit path through Topologies and FitSection and the Sort path through SortSection.of(raw), and then the use case saves each level with LevelUpdater.update(gameId, levelId, change), the role of LevelRepository that it holds, one transaction per level under a lock of its key, the change asks the incoming level, whose decideReplace(stored) decides the version rule of S3-10 (#174), or returns the problems as an error body; the LevelValidator lifeline carries «interface»; the footnote names the LevelOrder, LevelVersion and Coordinate values of a level and GetLevels, which only calls LevelLister.list(), says that LevelDefinition is an «entity» and the «aggregate root» of one level with private fields and that FitSection and SortSection are value objects, and names the Strategy pattern of LevelValidator and its validators](flows/views/seq-3-update-levels.png)

The code saves each level with one call, `update(gameId, levelId, change)` of `LevelUpdater`, the role of `LevelRepository` that `UpdateLevelsUseCase` holds (#80, #193). `DrizzleLevelRepository` opens one transaction per level, takes a Postgres advisory lock for the `gameId` and the `levelId`, restores the stored row through `LevelValidators` and passes its state to the change: absent, valid or broken (#147). The change asks the incoming level: `decideReplace(stored)` ([#174](https://github.com/Hexablock-Suite/hexablock-api/issues/174)) runs the version rule of S3-10 over the stored state — `accepts()` over a valid level, and the comparison with the stored version over a broken row, when that version is valid — and the adapter saves the level that a successful change returns in the same transaction. So two overlapping updates of one level run one after the other, and the later one cannot save an older copy: it gets the level problem `older-version`. A row lock is not enough, because the first update of a level has no row yet.

### Level routes

`LevelsController` serves the two routes of the level use cases (API-FR-04), as decided on [#81](https://github.com/Hexablock-Suite/hexablock-api/issues/81). `openapi/openapi.json` holds the same schemas. Both routes code against S3-02, one level format, and S3-10, which rejects only a lower `version`. Both were confirmed on 2026-11-16 on [#76](https://github.com/Hexablock-Suite/hexablock-api/issues/76).

| Route            | Handler    | Guard          | Request body                            | Success                                                                   |
| ---------------- | ---------- | -------------- | --------------------------------------- | ------------------------------------------------------------------------- |
| `GET /v1/levels` | `list()`   | none           | none                                    | 200, `LevelsDto`: `{ "levels": LevelDto[] }`, by `gameId`, then `levelId` |
| `PUT /v1/levels` | `update()` | `JwtAuthGuard` | `LevelsDto`: `{ "levels": LevelDto[] }` | 204, no body                                                              |

- `LevelDto` is one level of [`docs/level-format.md`](../level-format.md), field for field: `gameId`, `levelId`, `order`, `version`, `topology` and `section`. The OpenAPI document gives the section as `FitSectionDto` or `SortSectionDto`.
- No route has a parameter, a page size or a filter: one read gives every level.
- `PUT /v1/levels` is an idempotent batch. An equal `version` passes (S3-10), so a retry of the same batch is safe. An empty batch saves nothing and answers 204.
- Each failure has the `ErrorDto` body (API-FR-06):
  - 400 for a body with no array of level objects: `details` is `["levels must be an array of objects"]`.
  - 400 for a level that breaks a rule, with `message` `Request validation failed`. The API checks a batch in two steps. First `LevelDtoMapper` checks the fields and the common values of every level: the six fields of the format, then `gameId`, `levelId`, `order`, `version` and `topology`. Each level that fails gets one line of `details`, for its first problem. Only when every level passes that step, `UpdateLevelsUseCase` checks the rules of each level through the strategy of its `gameId`: its section, A5, or a `gameId` with no level files. Each level that breaks a rule gets one line, for its first broken rule. So a level with a wrong field hides the A5 problem of another level of the same batch.
  - Each line of `details` names one level by its `gameId` and its `levelId`. A level with no valid `gameId` or `levelId` is named by its place in the list, such as `levels[0]`. A problem of either step saves no level of the batch. A lower `version` fails in the save of its own level and gets its own line, and the other levels of the batch are saved.
  - 401 for an update without a valid token.
  - 500 for an unexpected failure, with no stack, no SQL and no rule in the body. A stored level that breaks a rule is not such a failure: the update replaces it, and the read names it in `unavailable` (#147). A save that fails after the first level keeps the levels saved before it, and a retry of the same batch saves every level.

Example request of `PUT /v1/levels`, with the Sort example of the format:

```json
{
  "levels": [
    {
      "gameId": "hexa-sort",
      "levelId": "sort-01",
      "order": 1,
      "version": 1,
      "topology": "hex",
      "section": {
        "radius": 2,
        "goals": 3,
        "source": { "seed": 20261115, "colors": ["red", "green", "blue"] },
        "stars": [{ "maxMoves": 40 }, { "maxMoves": 30 }, { "maxMoves": 20 }]
      }
    }
  ]
}
```

`GET /v1/levels` then answers 200 with the same body. Example answer of `PUT /v1/levels` when the witness of the Fit example fails A5:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Request validation failed",
  "details": ["gameId \"hexa-fit\", levelId \"fit-01\": inexact-witness"],
  "path": "/v1/levels"
}
```

## Other use cases

The other five use cases follow a path that one of the three flows already draws. Each row names that flow and the only differences.

| Use case                      | Endpoint                             | Path                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RegisterUseCase`             | `AuthController.signUp()`            | Same path as flow 2, except: the controller calls `RegisterUser` with the `RegisterUserRequest` of `AuthDtoMapper`; the use case hashes the `Password` with `PasswordHasher.hash()` and adds the `User` through `UserRepository.add()`. It returns a `UserId`.                                                                                                                                                                                                                                           |
| `AuthenticateTokenUseCase`    | none: `JwtAuthGuard` calls it        | The `ref AuthenticateToken` box of flows 1 and 3. Same path as flow 2, except: `JwtAuthGuard` calls the `AuthenticateToken` input port, and the use case asks `TokenIssuer.verify()`, then `UserRepository.exists()` for the `UserId` of the token. A `null` or a user that is not stored becomes the same failed `Result`, and the guard answers 401 (decision 14, [#137](https://github.com/Hexablock-Suite/hexablock-api/issues/137)).                                                                |
| `GetProgressUseCase`          | `ProgressController.read()`          | Same path as flow 1, except: `ProgressDtoMapper.toGetRequest()` builds the `GameId`; the use case only calls `ProgressRepository.find()` with the `ProgressKey` of the request, so it reads no `Clock` and saves nothing; a missing progress is a failed `Result`, and the controller answers 404.                                                                                                                                                                                                       |
| `GetGlobalLeaderboardUseCase` | `LeaderboardController.top()`        | Same path as flow 1 with `JwtAuthGuard` (S3-09), except: the use case holds the `GlobalBoardReader` port, which `DrizzleLeaderboardReader` implements, and answers the two `RankedBoard` values that the domain builds with the rows of the reader, ranked by `Score` and by `Standing`. It has no expected failure. It saves nothing (#218). [Routes](#leaderboard-routes).                                                                                                                             |
| `GetLevelLeaderboardUseCase`  | `LeaderboardController.topOfLevel()` | Same path as flow 1 with `JwtAuthGuard` (S3-09), except: the use case first asks `holds()` of `LevelHolder`, its role of `LevelRepository` (#193); a level that the definitions do not hold is the failed `Result` `UnknownLevel`, and the controller answers 404 (#146). Then it reads the `LevelBoardReader` port, which `DrizzleLeaderboardReader` implements, and answers the `RankedBoard` that the domain builds, ranked by `LevelResult`. It saves nothing (#218). [Routes](#leaderboard-routes). |
| `GetLevelsUseCase`            | `LevelsController.list()`            | Same path as flow 3, except: no guard, because only the update is guarded; the use case only calls `list()` of `LevelLister`, its role of `LevelRepository` (#193), so no validator runs; `LoggingAspect` wraps it and logs each stored row that breaks a rule through the `Logger` port, with `unavailableLevelEntries()` (#219); `LevelDtoMapper.toDto()` builds each `LevelDto`, and `toLevelsDto()` adds `unavailable` only for a broken row (#147).                                                 |

## Leaderboard routes

`LeaderboardController` serves the two leaderboard routes (API-FR-03): `top()` calls `GetGlobalLeaderboard`, and `topOfLevel()` calls `GetLevelLeaderboard` (#218). Both routes are behind `JwtAuthGuard`: S3-09 was confirmed on 2026-11-16 on [#76](https://github.com/Hexablock-Suite/hexablock-api/issues/76), and the team evaluates a public read later. The routes, the rank and the page size come from the decision recorded on [#83](https://github.com/Hexablock-Suite/hexablock-api/issues/83#issuecomment-6905667403). `openapi/openapi.json` holds the same schemas.

| Route                                           | Handler        | Path parameters                                                     | 200 body                                                                                                  |
| ----------------------------------------------- | -------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `GET /v1/leaderboard/{gameId}`                  | `top()`        | `gameId`, a lowercase slug                                          | `GlobalLeaderboardDto`: `gameId`, `highScores` (`ScoreEntryDto[]`) and `standings` (`StandingEntryDto[]`) |
| `GET /v1/leaderboard/{gameId}/levels/{levelId}` | `topOfLevel()` | `gameId`, a lowercase slug, and `levelId`, a text that is not blank | `LevelLeaderboardDto`: `gameId`, `levelId` and `entries` (`LevelEntryDto[]`)                              |

- A `ScoreEntryDto` row holds `rank`, `userId`, `username` and `highScore`. A `StandingEntryDto` row holds `rank`, `userId`, `username`, `stars`, `levelsCompleted`, `moves` and `elapsedMs`, the totals of the stored level results of the player. A `LevelEntryDto` row holds `rank`, `userId`, `username`, `stars`, `moves` and `elapsedMs`.
- `username` is the name of the account of the player, as the player typed it at sign-up ([#230](https://github.com/Hexablock-Suite/hexablock-api/issues/230)). `DrizzleLeaderboardReader` joins the `users` table on the `userId` of each row and builds a `Username`, and the mapper receives the name that it delivers. A stored name that breaks the rule of `Username` is a server fault, a 500.
- `highScores` ranks by `Score.isHigherThan()`, `standings` by `Standing.isBetterThan()` (S3-03), and `entries` by `LevelResult.isBetterThan()` (DS-4). `GameId` is open (decision 5 of [classes.md](classes.md)), so the global route gives both lists for every game, and no list of `gameId` exists. A list holds only the players who have a result to rank (decision of [#82](https://github.com/Hexablock-Suite/hexablock-api/issues/82)): `highScores` of Fit and Sort is empty, and `standings` of Lines and Merge is empty.
- `rank` is 1 plus the number of rows of the same list that are strictly better. A full tie shares a rank, and the next rank skips: 1, 1, 3. The tied rows come out by `userId` ascending, through `UserId.comesBefore()`.
- No query parameter and no page size: a list holds every player who has a result to rank.
- A game with no stored result gives empty lists, not a 404. So does a stored level with no result: a stored row that breaks a rule counts as stored. The board of a level that the level definitions do not hold answers 404 with the `ErrorDto` body, message `No level <levelId> for gameId <gameId>`, because the API holds every level (API-FR-03, [#146](https://github.com/Hexablock-Suite/hexablock-api/issues/146)). A result of that level does not make a board. A `gameId` or a `levelId` that breaks its rule gives a 400, and a request without a valid token gives a 401, both with the `ErrorDto` body (API-FR-06).

Example answer of `GET /v1/leaderboard/hexa-lines`:

```json
{
  "gameId": "hexa-lines",
  "highScores": [
    {
      "rank": 1,
      "userId": "0b6f6a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
      "username": "ada",
      "highScore": 120
    },
    {
      "rank": 1,
      "userId": "6f1c1d0e-2b7a-4c55-9a51-0d6c7a1e8f01",
      "username": "Grace",
      "highScore": 120
    },
    {
      "rank": 3,
      "userId": "9a3e5c7d-4b2f-4e1a-8c6d-2f4b6d8e0a1c",
      "username": "linus",
      "highScore": 80
    }
  ],
  "standings": []
}
```

Example answer of `GET /v1/leaderboard/hexa-fit/levels/fit-01`:

```json
{
  "gameId": "hexa-fit",
  "levelId": "fit-01",
  "entries": [
    {
      "rank": 1,
      "userId": "0b6f6a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
      "username": "ada",
      "stars": 3,
      "moves": 10,
      "elapsedMs": 45000
    },
    {
      "rank": 2,
      "userId": "6f1c1d0e-2b7a-4c55-9a51-0d6c7a1e8f01",
      "username": "Grace",
      "stars": 3,
      "moves": 12,
      "elapsedMs": 45000
    }
  ]
}
```

## How to read the class view

- The zones are the Clean layers, with the colors of [layers.md](layers.md): light blue for layer 3, purple for layer 2 and yellow for layer 1. Dark blue marks layer 4, which no flow touches. The outer layer is at the top, so every dependency between layers points down.
- The lines follow the notation of [classes.md](classes.md). A use arrow joins two layers. A realization joins an adapter to its port. A filled diamond joins the root of an aggregate to each internal entity, a hollow diamond joins a decorator to the type that it wraps, and every other attribute, another GoF pattern included, is a use arrow (decision 13 of [classes.md](classes.md)). The flows draw no internal entity and no decorator, so they draw no diamond: `PlayerProgress` keeps its `LevelResult` values through a use arrow labelled `levelResults 0..*`. Flow 3 draws a use arrow `entries 0..*` from `LevelValidators` to `LevelValidator`.
- A dashed frame labelled `Aggregate` marks the boundary of an aggregate, as in [classes.md](classes.md). Flow 1 frames `PlayerProgress` with `ProgressKey`, `LevelResult` and `SyncInstant`. Flows 2 and 3 draw the root of their aggregate, `User` or `LevelDefinition`, as a full class with no member, so the frame encloses the root alone. Views 1.3, 1.2 and 1.5 of [classes.md](classes.md) draw the members.
- The views draw the input ports, such as `SyncProgress`, `Login`, `UpdateLevels` and `AuthenticateToken`, as interface boxes, not as lollipops. A box lets the controller and the guard point at the port they hold. The `execute()` member of each input port is the one of its use case: every input port binds `UseCase` (decision 7).
- The teal class is the focal class: the use case.
- A flow view shows more than the seven classes of the other views, because it follows one request through every layer.
- A flow view draws only the bands of the layers that its use case touches. No flow has a class in layer 4: every adapter of a port lives in layer 3 (#212, option C). So each flow draws three bands.

## How to read the sequence diagram

- Time runs down. Each lifeline is one object of a class of the class view. Its header names the layer of that class, in the same color as its zone.
- The frame `sd SyncProgress`, `sd Login` or `sd UpdateLevels` holds the interaction. A message on its left edge enters or leaves the API: the HTTP request at the top and the HTTP response at the bottom.
- A solid line with a filled arrowhead is a call. A dashed line with an open arrowhead is a reply, or a `«create»` message that makes a new object.
- A white bar on a lifeline is an activation: the object runs.
- A call through a port names the port, for example `ProgressRepository.update()`. The caller holds only the port. `AppModule` binds the port to the adapter, so the lifeline is the adapter that runs.
- An `alt`, `opt` or `loop` fragment shows a choice, an optional step or a repetition. Its guard, in square brackets, says when it runs. Fragments can nest: in flow 2 the wrong-password `alt` sits inside the `[else]` of the unknown-user `alt`. A `ref` box stands for a flow that another view details: in flows 1 and 3, the token check of Part 2, view 4.
- In flow 1, `change(stored)` is a call back from `DrizzleProgressRepository` into `SyncProgressUseCase`. The use case passes the change to `update()`, and the adapter runs it under the lock of the key. The second activation bar on the use case lifeline is that change. A grey note next to the adapter names what it does before and after the change.
- In flow 3, the `LevelValidator` lifeline is the strategy that `LevelValidators` finds for the `gameId` of the level: `FitLevelValidator` or `SortLevelValidator`. A lifeline of the interface shows that the domain service knows only the Strategy interface. `LevelValidators` then builds the level with `LevelDefinition.of()`; the diagram writes that step as an action on its lifeline. A note, a box with a folded corner, gives the Fit path of the strategy: `FitLevelValidator` finds the `Topology` of the level in `Topologies`, and `FitSection` checks A5 on it. A topology with no entry gives `unknown-topology`.

## Details of these views

The flows show some members that the small views of [classes.md](classes.md) do not show. Each detail below is in the code, unless it says that it is a proposal for the team.

### Flow 1: sync progress

- `SyncProgressRequest` holds `userId`, `gameId`, an optional `score` and `results`, each one a domain value that `ProgressDtoMapper` builds.
- `ProgressController.sync()` takes the `userId` that `JwtAuthGuard` puts on the request, and `ProgressDtoMapper.toRequest()` builds the request. Views 3.3 and 3.5 of [classes.md](classes.md) show both members.
- The route is `POST /v1/progress`, and a success answers 200 with `ProgressDto`, as `openapi/openapi.json` records.

### Flow 2: login

- `LoginRequest` holds a `Username` and a `PasswordAttempt`, and `RegisterUserRequest` holds a `Username` and a `Password` ([#105](https://github.com/Hexablock-Suite/hexablock-api/issues/105)). View 2.4 names both types, and the class view of this flow draws `LoginRequest` with its fields.
- Decision 11 says that a use case returns an expected failure as a value. So `Login` binds `UseCase<LoginRequest, Result<SessionToken, LoginProblem>>`, as `AuthenticateToken` binds `UseCase<SessionToken, Result<UserId, TokenProblem>>` (decision 7). `LoginProblem` is `{ kind: 'invalid-credentials' }`, one value for an unknown username and for a wrong password ([#104](https://github.com/Hexablock-Suite/hexablock-api/issues/104)). The sequence diagram labels that reply `failure`.
- `AuthController` answers a failed login with 401 and the error body of API-FR-06. API-FR-01 fixes 401 only for a call without a token.
- `AuthDtoMapper` builds the `LoginRequest` from `LoginDto`, which has no length rules, and `TokenDto` from `SessionToken`. The choice is a mapper, not code in the controller ([#105](https://github.com/Hexablock-Suite/hexablock-api/issues/105)): decision 12 of [classes.md](classes.md) says that a controller holds no translation code, and that the border builds the domain values for every use case. View 3.5 draws `AuthDtoMapper`. A username that breaks its rule gets the 401 of a wrong password from the mapper, before the use case, so it costs no hash check. No stored user has such a name, so the answer time tells nothing about the stored names.
- `LoginUseCase` first rejects a password longer than the maximum of `PASSWORD_LENGTH`, before it calls a port, with the same failure as a wrong password (#60). This check bounds the hash work of one request. The sequence diagram does not draw it.

### Flow 3: update levels

- `UpdateLevelsRequest` holds `levels`, one `IncomingLevel` per level: the values of the common part as domain values and the section as it arrives. `LevelDtoMapper.toRequest()` builds it from the body. The use case asks `LevelValidators.check()` for each level, so no level exists before its strategy builds the section (#77). Built in #81.
- A failed `Result` holds `InvalidLevels`. `LevelDtoMapper.toDetails()` writes the details of the 400 body, one line per level problem, and `HttpErrorFilter` answers it with `ErrorDto` ([Level routes](#level-routes)). Built in #81.
- Q4 (2026-11-03, changed on 2026-11-16 on #134 and on 2026-11-17 on #145): `UpdateLevels` sits behind `JwtAuthGuard` and `LevelEditorGuard`, so only an account whose user id is in `LEVEL_EDITOR_IDS` may update, with no roles; an empty or unset list lets no account update. `GetLevels` has no guard.
- S3-02 and S3-10 were confirmed on 2026-11-16 on [#76](https://github.com/Hexablock-Suite/hexablock-api/issues/76), and #81 codes against both.

## Render the images

The class views come from [`classes/views/flow-1-sync-progress.html`](classes/views/flow-1-sync-progress.html), [`classes/views/flow-2-login.html`](classes/views/flow-2-login.html) and [`classes/views/flow-3-update-levels.html`](classes/views/flow-3-update-levels.html). The sequence diagrams come from [`flows/views/seq-1-sync-progress.html`](flows/views/seq-1-sync-progress.html), [`flows/views/seq-2-login.html`](flows/views/seq-2-login.html) and [`flows/views/seq-3-update-levels.html`](flows/views/seq-3-update-levels.html). Each file holds one inline SVG, as the class views do. The `.png` image next to it is that SVG alone, rendered as [«Render the images» of classes.md](classes.md#render-the-images) says, with its page width. Commit each `.html` file together with its `.png` image.
