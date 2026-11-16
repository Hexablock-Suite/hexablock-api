# Use case flows

Status: draft for team review, 2026-11-04.

This page shows how a use case crosses the four Clean layers of the API. It draws one pair of views for each path that shows something new, and the table [Other use cases](#other-use-cases) names the path that each other use case follows. In the class of 2026-11-03 the professor asked to see a pair of use cases and how the layers interact in each. He wanted to see how the product talks to the backend. Each use case here has two views with the same class names:

- A class view of the use case only. It draws every class of the slice, from the controller to the domain, in the layer bands of [classes.md](classes.md).
- A UML sequence diagram. It shows the calls in time order, from the HTTP request that enters the API to the HTTP response.

The layers themselves are in [layers.md](layers.md). The full class diagram is in [classes.md](classes.md).

## Use case 1: sync progress

The app calls this endpoint when it syncs its progress and its leaderboard: `SaveProgress` in `hexablock-app` sends the progress through its `ApiProgressRepository`. The endpoint is `ProgressController.sync()` (API-FR-02). It is the only endpoint that receives data from the app on each game, and it crosses all four layers: a guard, a controller and a mapper in layer 3, a use case and its ports in layer 2, the progress aggregate in layer 1, and a driver in layer 4.

### Class view

![Sync progress class view: JwtAuthGuard, ProgressController, ProgressDtoMapper and DrizzleProgressRepository in layer 3, SystemClock in layer 4, SyncProgressUseCase with the SyncProgress and AuthenticateToken input ports, SyncProgressRequest and the ProgressRepository and Clock ports in layer 2, PlayerProgress and LevelResult in layer 1](classes/views/flow-1-sync-progress.png)

### Sequence diagram

![Sync progress sequence: the HTTP request enters JwtAuthGuard, ProgressController builds a SyncProgressRequest and calls SyncProgress, SyncProgressUseCase finds, updates and saves the PlayerProgress through its ports, and the controller answers with a ProgressDto](flows/views/seq-1-sync-progress.png)

The code runs the find, the change and the save of this view as one call, `ProgressRepository.update(userId, gameId, change)`. `DrizzleProgressRepository` opens one transaction, takes a Postgres advisory lock for the `userId` and `gameId`, reads the aggregate and passes it, or `null`, to the change. The change reads `Clock.now()` first, then starts or changes the `PlayerProgress`. The adapter saves what the change returns in the same transaction. So two overlapping syncs of one key run one after the other: no level result is lost, and `updatedAt` never moves back. A row lock is not enough, because the first sync of a game has no row yet. The view still draws `find()` and `save()`; it needs a new layout to draw the change as a call back into the use case.

## Use case 2: login

The app calls this endpoint when a player signs in. The endpoint is `AuthController.signIn()` (API-FR-01). Its path is new in two ways. First, it has no guard, because the player has no token yet. Second, the use case holds three ports, and two of their adapters live in layer 4: `ScryptPasswordHasher` checks the password and `JwtTokenIssuer` issues the `SessionToken` that every guarded request then carries. The use case answers no in two places, an unknown username and a wrong password, so the sequence diagram has two `alt` fragments. The use case never opens the `User`: it asks `user.passwordMatches()` with the `PasswordHasher` port, the user passes its own hash to `verify()`, and `TokenIssuer.issue()` takes the `User` (decision 16 of [classes.md](classes.md)).

### Class view

![Login class view: ScryptPasswordHasher and JwtTokenIssuer in layer 4, AuthController and DrizzleUserRepository in layer 3, LoginUseCase with the Login input port and the UserRepository, PasswordHasher and TokenIssuer ports in layer 2, and the User aggregate root and the PasswordVerifier interface in layer 1](classes/views/flow-2-login.png)

### Sequence diagram

![Login sequence: the HTTP request enters AuthController with no token, LoginUseCase finds the User through DrizzleUserRepository, asks ScryptPasswordHasher for one check against a dummy hash and answers a failure when the user is missing, otherwise asks the User if the password matches, the User passes its own hash to ScryptPasswordHasher, the use case answers a failure when the password does not match, and otherwise asks JwtTokenIssuer for a SessionToken, which the controller answers as a TokenDto](flows/views/seq-2-login.png)

## Use case 3: update levels

A signed-in client calls this endpoint to publish new levels without an app update. The professor asks for no level editor and no roles (Q4, answered 2026-11-03), so the token guard is the only check. The endpoint is `LevelsController.update()`, `PUT /levels` (API-FR-04). Its path is new because it makes the Strategy of §3.3 visible: `LevelValidators` is a domain service that holds one `LevelValidator` per `gameId`, and `FitLevelValidator` and `SortLevelValidator` implement it. The strategy only picks the section type, the section checks its own shape and holds its rules, and `LevelValidators` creates each level, so no level exists before its section is valid (decisions 4 and 5 of [classes.md](classes.md)). The use case checks every level before it saves any level, so the sequence diagram has a `loop` over the levels and an `alt` that saves the levels one by one or returns the problems. No class of layer 4 takes part.

### Class view

![Update levels class view: JwtAuthGuard, LevelsController, LevelDtoMapper and DrizzleLevelRepository in layer 3, UpdateLevelsUseCase with the AuthenticateToken and UpdateLevels input ports and the LevelRepository port in layer 2, and the LevelValidators domain service with its LevelValidator strategies FitLevelValidator, which holds Topologies, and SortLevelValidator and the LevelDefinition aggregate root in layer 1](classes/views/flow-3-update-levels.png)

### Sequence diagram

![Update levels sequence: JwtAuthGuard verifies the token, LevelsController builds the request with LevelDtoMapper and calls UpdateLevels, the use case asks LevelValidators to check each level, the LevelValidator strategy of its gameId picks the section type and LevelValidators builds the level, a note gives the Fit path through Topologies and FitSection, and then the use case saves each level with LevelRepository.update(gameId, levelId, change), one transaction per level under a lock of its key, or returns the problems as an error body](flows/views/seq-3-update-levels.png)

The code saves each level with one call, `LevelRepository.update(gameId, levelId, change)` (#80). `DrizzleLevelRepository` opens one transaction per level, takes a Postgres advisory lock for the `gameId` and the `levelId`, restores the stored level through `LevelValidators` and passes it, or `null`, to the change. The change runs `stored.accepts(level)`, the version rule of S3-10, and the adapter saves the level that a successful change returns in the same transaction. So two overlapping updates of one level run one after the other, and the later one cannot save an older copy: it gets the level problem `older-version`. A row lock is not enough, because the first update of a level has no row yet.

### Level routes

`LevelsController` serves the two routes of the level use cases (API-FR-04), as decided on [#81](https://github.com/Hexablock-Suite/hexablock-api/issues/81). `openapi/openapi.json` holds the same schemas. Both routes code against S3-02, one level format, and S3-10, which rejects only a lower `version`. Both are proposals for the team on [#76](https://github.com/Hexablock-Suite/hexablock-api/issues/76), «Propuesta, pendiente del equipo».

| Route         | Handler    | Guard          | Request body                            | Success                                                                   |
| ------------- | ---------- | -------------- | --------------------------------------- | ------------------------------------------------------------------------- |
| `GET /levels` | `list()`   | none           | none                                    | 200, `LevelsDto`: `{ "levels": LevelDto[] }`, by `gameId`, then `levelId` |
| `PUT /levels` | `update()` | `JwtAuthGuard` | `LevelsDto`: `{ "levels": LevelDto[] }` | 204, no body                                                              |

- `LevelDto` is one level of [`docs/level-format.md`](../level-format.md), field for field: `gameId`, `levelId`, `order`, `version`, `topology` and `section`. The OpenAPI document gives the section as `FitSectionDto` or `SortSectionDto`.
- No route has a parameter, a page size or a filter: one read gives every level.
- `PUT /levels` is an idempotent batch. An equal `version` passes (S3-10), so a retry of the same batch is safe. An empty batch saves nothing and answers 204.
- Each failure has the `ErrorDto` body (API-FR-06):
  - 400 for a body with the wrong shape: `details` is `["levels must be an array of objects"]`.
  - 400 for a level that breaks a rule: a value of the common part, its section, A5, a lower `version` than the stored one, or a `gameId` with no level files. `message` is `Request validation failed`, and each line of `details` names one level by its `gameId` and its `levelId`. A level with no valid `gameId` or `levelId` is named by its place in the list, such as `levels[0]`. A problem of the check saves no level of the batch. A lower `version` fails in the save of its own level, so the other levels of the batch are saved.
  - 401 for an update without a valid token.
  - 500 for an unexpected failure, with no stack, no SQL and no rule in the body. A stored level that breaks a rule is such a failure. A save that fails after the first level keeps the levels saved before it, and a retry of the same batch saves every level.

Example request of `PUT /levels`, with the Sort example of the format:

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

`GET /levels` then answers 200 with the same body. Example answer of `PUT /levels` when the witness of the Fit example fails A5:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Request validation failed",
  "details": ["gameId \"hexa-fit\", levelId \"fit-01\": inexact-witness"],
  "path": "/levels"
}
```

## Other use cases

The other four use cases follow a path that one of the three flows already draws. Each row names that flow and the only differences.

| Use case                   | Endpoint                      | Path                                                                                                                                                                                                                                                                    |
| -------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RegisterUseCase`          | `AuthController.signUp()`     | Same path as flow 2, except: the controller calls the `RegisterUser` input port; the use case hashes the password with `PasswordHasher.hash()` and adds the `User` through `UserRepository.add()`. It holds no `TokenIssuer` and returns a `UserId`.                    |
| `AuthenticateTokenUseCase` | none: `JwtAuthGuard` calls it | The `ref AuthenticateToken` box of flows 1 and 3. Same path as flow 2, except: `JwtAuthGuard` calls the `AuthenticateToken` input port, and the use case only asks `TokenIssuer.verify()`. A `null` becomes a failed `Result`, and the guard answers 401 (decision 14). |
| `GetLeaderboardUseCase`    | `LeaderboardController.top()` | Same path as flow 1, except: no guard; the use case holds only the `LeaderboardReader` port, which `DrizzleLeaderboardReader` implements, and returns `LeaderboardEntry` read models. It reads no `Clock` and saves nothing. It ranks by DS-4: stars, moves, then time. |
| `GetLevelsUseCase`         | `LevelsController.list()`     | Same path as flow 3, except: no guard, because only the update is guarded; the use case only calls `LevelRepository.list()`, so no validator runs; `LevelDtoMapper.toDto()` builds each `LevelDto`.                                                                     |

## How to read the class view

- The zones are the Clean layers, with the colors of [layers.md](layers.md): dark blue for layer 4, light blue for layer 3, purple for layer 2 and yellow for layer 1. The outer layer is at the top, so every dependency between layers points down.
- The lines follow the notation of [classes.md](classes.md). A use arrow joins two layers. A realization joins an adapter to its port. A filled diamond joins the root of an aggregate to each internal entity, and every other attribute, a GoF pattern included, is a use arrow (decision 13 of [classes.md](classes.md)). The flows draw no internal entity, so they draw no diamond: `PlayerProgress` keeps its `LevelResult` values through a use arrow labelled `results 0..*`. Flow 3 draws a use arrow `entries 0..*` from `LevelValidators` to `LevelValidator`.
- The views draw the input ports, such as `SyncProgress`, `Login`, `UpdateLevels` and `AuthenticateToken`, as interface boxes, not as lollipops. A box lets the controller and the guard point at the port they hold. The `execute()` member of each input port is the one of its use case: every input port binds `UseCase` (decision 7).
- The teal class is the focal class: the use case.
- A flow view shows more than the seven classes of the other views, because it follows one request through every layer.
- A flow view draws only the bands of the layers that its use case touches. Flow 3 has no class in layer 4, so it draws three bands.

## How to read the sequence diagram

- Time runs down. Each lifeline is one object of a class of the class view. Its header names the layer of that class, in the same color as its zone.
- The frame `sd SyncProgress`, `sd Login` or `sd UpdateLevels` holds the interaction. A message on its left edge enters or leaves the API: the HTTP request at the top and the HTTP response at the bottom.
- A solid line with a filled arrowhead is a call. A dashed line with an open arrowhead is a reply, or a `«create»` message that makes a new object.
- A white bar on a lifeline is an activation: the object runs.
- A call through a port names the port, for example `ProgressRepository.find()`. The caller holds only the port. `AppModule` binds the port to the adapter, so the lifeline is the adapter that runs.
- An `alt` or `loop` fragment shows a choice or a repetition. Its guard, in square brackets, says when it runs. Fragments can nest: in flow 2 the wrong-password `alt` sits inside the `[else]` of the unknown-user `alt`. A `ref` box stands for a flow that another view details: in flows 1 and 3, the token check of Part 2, view 4.
- In flow 3, the `LevelValidator` lifeline is the strategy that `LevelValidators` finds for the `gameId` of the level: `FitLevelValidator` or `SortLevelValidator`. A lifeline of the interface shows that the domain service knows only the Strategy interface. `LevelValidators` then builds the level with `LevelDefinition.of()`; the diagram writes that step as an action on its lifeline. A note, a box with a folded corner, gives the Fit path of the strategy: `FitLevelValidator` finds the `Topology` of the level in `Topologies`, and `FitSection` checks A5 on it. A topology with no entry gives `unknown-topology`.

## Proposals in these views

The flows need some members that the small views of [classes.md](classes.md) do not show yet. The team reviews them before the views of Parts 2 and 3 take them.

### Flow 1: sync progress

- `SyncProgressRequest` holds `userId`, `gameId`, `score` and `results`. The team has not fixed these fields yet.
- `ProgressController.sync()` takes the `userId` that `JwtAuthGuard` puts on the request, and `ProgressDtoMapper.toRequest()` builds the request. Views 3.3 and 3.5 of [classes.md](classes.md) do not show these two members yet.
- The route path and the success status wait on the OpenAPI export of the endpoint.

### Flow 2: login

- `Credentials` holds `username` and `password`. View 2.4 names the type but not its fields.
- `LoginUseCase.execute()` returns `Promise<SessionToken>` in view 2.4, so it has no value for an unknown username or a wrong password. Decision 11 says that a use case returns an expected failure as a value. The proposal: `Login` returns `Result<SessionToken, LoginProblem>`, as `AuthenticateToken` returns `Result<UserId, TokenProblem>`. The sequence diagram labels that reply `failure (proposal)`.
- `AuthController` answers a failed login with 401 and the error body of API-FR-06. API-FR-01 fixes 401 only for a call without a token.
- `AuthController` builds `Credentials` from `LoginDto`, which has no length rules, and `TokenDto` from `SessionToken`. View 3.5 has no auth mapper. The team decides between a mapper such as `AuthDtoMapper` and code in the controller.
- `LoginUseCase` first rejects a password longer than the maximum of `PASSWORD_LENGTH`, before it calls a port, with the same failure as a wrong password (#60). This check bounds the hash work of one request. The sequence diagram does not draw it.

### Flow 3: update levels

- `UpdateLevelsRequest` holds `levels`, one `IncomingLevel` per level: the values of the common part as domain values and the section as it arrives. `LevelDtoMapper.toRequest()` builds it from the body. The use case asks `LevelValidators.check()` for each level, so no level exists before its strategy builds the section (#77). Built in #81.
- A failed `Result` holds `InvalidLevels`. `LevelDtoMapper.toDetails()` writes the details of the 400 body, one line per level problem, and `HttpErrorFilter` answers it with `ErrorDto` ([Level routes](#level-routes)). Built in #81.
- Q4 is answered (2026-11-03): the professor asks for no level editor and no roles, so the token guard is the only check of `UpdateLevels`. `GetLevels` has no guard.
- S3-02 and S3-10 are proposals for the team on [#76](https://github.com/Hexablock-Suite/hexablock-api/issues/76), «Propuesta, pendiente del equipo», and #81 codes against both.

## Render the images

The class views come from [`classes/views/flow-1-sync-progress.html`](classes/views/flow-1-sync-progress.html), [`classes/views/flow-2-login.html`](classes/views/flow-2-login.html) and [`classes/views/flow-3-update-levels.html`](classes/views/flow-3-update-levels.html). The sequence diagrams come from [`flows/views/seq-1-sync-progress.html`](flows/views/seq-1-sync-progress.html), [`flows/views/seq-2-login.html`](flows/views/seq-2-login.html) and [`flows/views/seq-3-update-levels.html`](flows/views/seq-3-update-levels.html). Each file holds one inline SVG, as the class views do. The `.png` image next to it is that SVG alone, in a page 1236 px wide, rendered at scale 2 by a headless browser. Commit each `.html` file together with its `.png` image.
