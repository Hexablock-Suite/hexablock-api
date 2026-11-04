# Use case flows

Status: draft for team review, 2026-11-04.

This page shows how one use case crosses the four Clean layers of the API. In the class of 2026-11-03 the professor asked to see a pair of use cases and how the layers interact in each. He wanted to see how the product talks to the backend. Each use case here has two views with the same class names:

- A class view of the use case only. It draws every class of the slice, from the controller to the domain, in the layer bands of [classes.md](classes.md).
- A UML sequence diagram. It shows the calls in time order, from the HTTP request that enters the API to the HTTP response.

The layers themselves are in [layers.md](layers.md). The full class diagram is in [classes.md](classes.md).

## Use case 1: sync progress

The app calls this endpoint when it syncs its progress and its leaderboard: `SyncLeaderboard` in `hexablock-app` sends the progress through its `ApiProgressRepository`. The endpoint is `ProgressController.sync()` (API-FR-02). It is the only endpoint that receives data from the app on each game, and it crosses all four layers: a guard, a controller and a mapper in layer 3, a use case and its ports in layer 2, the progress aggregate in layer 1, and a driver in layer 4.

### Class view

![Sync progress class view: JwtAuthGuard, ProgressController, ProgressDtoMapper and DrizzleProgressRepository in layer 3, SystemClock in layer 4, SyncProgressUseCase with the SyncProgress and AuthenticateToken input ports, SyncProgressRequest and the ProgressRepository and Clock ports in layer 2, PlayerProgress and LevelResult in layer 1](classes/views/flow-1-sync-progress.png)

### Sequence diagram

![Sync progress sequence: the HTTP request enters JwtAuthGuard, ProgressController builds a SyncProgressRequest and calls SyncProgress, SyncProgressUseCase finds, updates and saves the PlayerProgress through its ports, and the controller answers with a ProgressDto](flows/views/seq-1-sync-progress.png)

## How to read the class view

- The zones are the Clean layers, with the colors of [layers.md](layers.md): dark blue for layer 4, light blue for layer 3, purple for layer 2 and yellow for layer 1. The outer layer is at the top, so every dependency between layers points down.
- The lines follow the notation of [classes.md](classes.md). A use arrow joins two layers. A realization joins an adapter to its port. A diamond stays inside one layer: here `PlayerProgress` keeps its `LevelResult` values.
- The view draws the input ports `SyncProgress` and `AuthenticateToken` as interface boxes, not as lollipops. A box lets the controller and the guard point at the port they hold.
- The teal class is the focal class: the use case.
- This view shows more than the seven classes of the other views, because it follows one request through every layer.

## How to read the sequence diagram

- Time runs down. Each lifeline is one object of a class of the class view. Its header names the layer of that class, in the same color as its zone.
- The frame `sd SyncProgress` holds the interaction. A message on its left edge enters or leaves the API: the HTTP request at the top and the HTTP response at the bottom.
- A solid line with a filled arrowhead is a call. A dashed line with an open arrowhead is a reply, or a `«create»` message that makes a new object.
- A white bar on a lifeline is an activation: the object runs.
- A call through a port names the port, for example `ProgressRepository.find()`. The caller holds only the port. `AppModule` binds the port to the adapter, so the lifeline is the adapter that runs.
- An `alt` or `loop` fragment shows a choice or a repetition. Its guard, in square brackets, says when it runs. A `ref` box stands for a flow that another view details: here the token check of Part 2, view 4.

## Proposals in these views

- `SyncProgressRequest` holds `userId`, `gameId`, `score` and `results`. The team has not fixed these fields yet.
- `ProgressController.sync()` takes the `userId` that `JwtAuthGuard` puts on the request, and `ProgressDtoMapper.toRequest()` builds the request. Views 3.3 and 3.5 of [classes.md](classes.md) do not show these two members yet.
- The route path and the success status wait on the OpenAPI export of the endpoint.

## Render the images

The class view comes from [`classes/views/flow-1-sync-progress.html`](classes/views/flow-1-sync-progress.html). The sequence diagram comes from [`flows/views/seq-1-sync-progress.html`](flows/views/seq-1-sync-progress.html). Each file holds one inline SVG, as the class views do. The `.png` image next to it is that SVG alone, in a page 1236 px wide, rendered at scale 2 by a headless browser. Commit each `.html` file together with its `.png` image.
