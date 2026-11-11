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

A signed-in client calls this endpoint to publish new levels without an app update. The professor asks for no level editor and no roles (Q4, answered 2026-11-03), so the token guard is the only check. The endpoint is `LevelsController.update()` (API-FR-04). Its path is new because it makes the Strategy of §3.3 visible: `LevelValidators` is a registry that holds one `LevelValidator` per `gameId`, and `FitLevelValidator` and `SortLevelValidator` implement it. The class view draws a diamond only there, because it is a pattern inside one layer. The use case checks every level before it saves any level, so the sequence diagram has a `loop` over the levels and an `alt` that saves the levels or returns the problems. No class of layer 4 takes part.

### Class view

![Update levels class view: JwtAuthGuard, LevelsController, LevelDtoMapper and DrizzleLevelRepository in layer 3, UpdateLevelsUseCase with the AuthenticateToken and UpdateLevels input ports and the LevelRepository port in layer 2, and LevelValidators with its LevelValidator strategies FitLevelValidator and SortLevelValidator and the LevelDefinition entity in layer 1](classes/views/flow-3-update-levels.png)

### Sequence diagram

![Update levels sequence: JwtAuthGuard verifies the token, LevelsController maps each LevelDto with LevelDtoMapper and calls UpdateLevels, the use case asks LevelValidators to check each level through the LevelValidator strategy of its gameId, and then saves the levels or returns the problems as an error body](flows/views/seq-3-update-levels.png)

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
- The lines follow the notation of [classes.md](classes.md). A use arrow joins two layers. A realization joins an adapter to its port. A diamond appears only where it makes a GoF pattern visible («Aquí sí porque quiero hacer visible el patrón estratégico», class of 2026-11-02). Flows 1 and 2 show no pattern, so they draw no diamond: `PlayerProgress` keeps its `LevelResult` values through a use arrow labelled `results 0..*`. Flow 3 draws one hollow diamond, from `LevelValidators` to `LevelValidator`, because that registry of strategies is the Strategy of §3.3.
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
- In flow 3, the `LevelValidator` lifeline is the strategy that `LevelValidators` finds for the `gameId` of the level: `FitLevelValidator` or `SortLevelValidator`. A lifeline of the interface shows that the registry knows only the Strategy interface.

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

- `UpdateLevelsRequest` holds `levels: AnyLevel[]`, which `LevelsController` builds from the `LevelDto` values that `LevelDtoMapper.toLevel()` returns. View 2.3 names the type but not its fields.
- A failed `Result` gives the error body that `LevelDtoMapper.toErrorBody()` builds. The HTTP status of that body waits on API-FR-06 and the OpenAPI export.
- Q4 stays open: who may call `UpdateLevels`. The guard checks only that the caller has a valid token.

## Render the images

The class views come from [`classes/views/flow-1-sync-progress.html`](classes/views/flow-1-sync-progress.html), [`classes/views/flow-2-login.html`](classes/views/flow-2-login.html) and [`classes/views/flow-3-update-levels.html`](classes/views/flow-3-update-levels.html). The sequence diagrams come from [`flows/views/seq-1-sync-progress.html`](flows/views/seq-1-sync-progress.html), [`flows/views/seq-2-login.html`](flows/views/seq-2-login.html) and [`flows/views/seq-3-update-levels.html`](flows/views/seq-3-update-levels.html). Each file holds one inline SVG, as the class views do. The `.png` image next to it is that SVG alone, in a page 1236 px wide, rendered at scale 2 by a headless browser. Commit each `.html` file together with its `.png` image.
