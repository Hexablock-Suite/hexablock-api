# Shared level format

Status: proposal for team review, 2026-11-15. It codes decision S3-02 of [#76](https://github.com/Hexablock-Suite/hexablock-api/issues/76), option A: one JSON level format for the app and the API, «Propuesta, pendiente del equipo».

This page is the one source of the level format. The API reads it for the level update and stores it ([#77](https://github.com/Hexablock-Suite/hexablock-api/issues/77) to [#81](https://github.com/Hexablock-Suite/hexablock-api/issues/81)). The app writes its bundled level files in it and reads the levels of the API in it ([hexablock-app#166](https://github.com/Hexablock-Suite/hexablock-app/issues/166), [hexablock-app#167](https://github.com/Hexablock-Suite/hexablock-app/issues/167)). The two complete examples at the end are the fixtures of the level tests of both repositories: `test/support/level-format.ts` reads them from this file. IDs such as DS-6, DS-11 and A5 refer to [`REQUIREMENTS.md`](REQUIREMENTS.md). Decision 4 of [`architecture/classes.md`](architecture/classes.md) names this page.

## One level

A level is one JSON object with a common part and a typed section (DS-6). The common part is the same for every game. The `gameId` says which section the level holds. Lines and Merge have no level files (API-FR-04), so only `fit` and `sort` have a section today.

| Field      | JSON type   | Rule                                                                                                | Domain value                  |
| ---------- | ----------- | --------------------------------------------------------------------------------------------------- | ----------------------------- |
| `gameId`   | string      | A lowercase slug: `fit` or `sort`. Another game has no section, so the API rejects its level.       | `GameId`                      |
| `levelId`  | string      | A non-blank text, unique in its game, such as `fit-01`.                                             | `LevelId`                     |
| `order`    | number      | A whole number of 1 or more: the place of the level in the list of its game. The first level has 1. | `LevelOrder`                  |
| `version`  | number      | A whole number of 1 or more. The first copy has 1. A change that must reach the players raises it.  | `LevelVersion`                |
| `topology` | string      | A lowercase slug that names how to read the coordinates: `hex`, `square` or `triangle`.             | `TopologyId`                  |
| `section`  | JSON object | The section of the game: the Fit section or the Sort section below.                                 | `FitSection` or `SortSection` |

The level object holds exactly these six fields. The `gameId` and the `levelId` are the identity of a level: two copies of one level have the same `gameId` and `levelId`. DS-11 decides which copy wins in the app: the higher `version`, and the bundled copy when the versions are equal. S3-10 decides what the API accepts: it rejects a copy with a lower `version` than the stored copy, and it accepts an equal or a higher one.

## Coordinates

A coordinate is a JSON list of whole numbers, such as `[2, 1]`. The `topology` of the level says how to read it, so a square, triangular or 3D level needs no new format (decision 6 of [`architecture/classes.md`](architecture/classes.md)).

- `hex`: the list is `[q, r]`, in axial coordinates. The third cube value is `s = -q - r`.
- One rotation step of `hex` is a sixth of a turn around the origin: the cell `[q, r]` turns to `[-r, q + r]`. Six steps make a full turn.
- Another topology gives the length of its list and its own rotation step. The API never rejects a level only because its topology is not `hex` (DS-6).

## The Fit section

| Field     | JSON type       | Rule                                                                                                                                       |
| --------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `figure`  | list of cells   | The cells that the player must cover. One coordinate or more.                                                                              |
| `pieces`  | list of objects | Each piece is `{ "id": string, "cells": list of cells }`. The `id` is a non-blank text. The cells are relative to the origin of the piece. |
| `witness` | list of objects | The solution of the designer (A5). Each entry is `{ "piece": string, "rotation": number, "at": cell }`.                                    |
| `stars`   | list of objects | The star thresholds, from the first star up. Each one is `{ "maxMoves": number, "maxElapsedMs": number }`, two whole numbers of 0 or more. |

- A witness entry places one piece. The piece turns `rotation` steps around its origin, and then it moves by `at`: each turned cell plus `at` is a covered cell. `rotation` is a whole number of steps of the topology, never degrees, and a negative count turns the other way. A piece only rotates; it is never mirrored (A5, C7).
- A5: the pieces cover the figure exactly. The areas of the pieces add up to the area of the figure, and the witness covers each cell of the figure once, with no cell outside it. Equal areas are not enough.
- A Fit star needs both of its limits: the moves of the play are at most `maxMoves`, and its time is at most `maxElapsedMs` milliseconds (hexablock-app#60). The stars are cumulative: star N needs star N-1, so a play gets one star for each leading threshold that it meets (DS-6).

## The Sort section

| Field    | JSON type       | Rule                                                                                                                                     |
| -------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `radius` | number          | A whole number of 1 or more. The board holds every cell at that distance or less from its center. On `hex`, the radius 2 gives 19 cells. |
| `goals`  | number          | A whole number of 1 or more: the count of stacks that the player clears to win.                                                          |
| `source` | JSON object     | The piece source (app A4): a seeded source or a fixed list of stacks, as the next list says.                                             |
| `stars`  | list of objects | The star thresholds, from the first star up. Each one is `{ "maxMoves": number }`, a whole number of 0 or more.                          |

- A seeded source is `{ "seed": number, "colors": list of strings }`. The seed is a whole number from 0 to 4294967295, and the same seed gives the same stacks. A draw picks a color from `colors` by its place in the list.
- A fixed source is `{ "stacks": list of stacks }`. A stack is a list of color names, from the bottom tile to the top tile. The source gives the stacks in their order.
- A color name is a non-blank text, such as `red`. Two names are the same color only when they are written the same way.
- A Sort star needs one limit: the moves of the play are at most `maxMoves`. The stars are cumulative, as for Fit (DS-6).

## Shape rules for both sections

- Each object holds exactly the fields of its table. A missing field and another field are both a wrong shape.
- Each list holds one item or more: the figure, the pieces, the cells of a piece, the witness, the stars, the colors, the stacks and each stack.
- A whole number is a JSON number with no fraction, inside the safe integer range of JavaScript.
- The API answers a level that breaks a rule with a level problem, never with a server error. The problem names the broken field, for example `invalid-figure` or `invalid-source` (type `LevelProblem` in `src/domain/level/level-problem.ts`).

## Complete Fit example

The figure is two rows of three hex cells. Piece `a` covers three cells with no rotation. Piece `b` turns one step, so its cells `[0, 0]` and `[1, 0]` become `[0, 0]` and `[0, 1]`, and then it moves by `[2, 0]`. Piece `c` covers the last cell.

```json
{
  "gameId": "fit",
  "levelId": "fit-01",
  "order": 1,
  "version": 1,
  "topology": "hex",
  "section": {
    "figure": [
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1]
    ],
    "pieces": [
      {
        "id": "a",
        "cells": [
          [0, 0],
          [1, 0],
          [0, 1]
        ]
      },
      {
        "id": "b",
        "cells": [
          [0, 0],
          [1, 0]
        ]
      },
      {
        "id": "c",
        "cells": [[0, 0]]
      }
    ],
    "witness": [
      { "piece": "a", "rotation": 0, "at": [0, 0] },
      { "piece": "b", "rotation": 1, "at": [2, 0] },
      { "piece": "c", "rotation": 0, "at": [1, 1] }
    ],
    "stars": [
      { "maxMoves": 12, "maxElapsedMs": 120000 },
      { "maxMoves": 8, "maxElapsedMs": 60000 },
      { "maxMoves": 4, "maxElapsedMs": 30000 }
    ]
  }
}
```

The witness covers the figure exactly, so the level passes A5:

| Piece | Rotation | At       | Covered cells                |
| ----- | -------- | -------- | ---------------------------- |
| `a`   | 0        | `[0, 0]` | `[0, 0]`, `[1, 0]`, `[0, 1]` |
| `b`   | 1        | `[2, 0]` | `[2, 0]`, `[2, 1]`           |
| `c`   | 0        | `[1, 1]` | `[1, 1]`                     |

The pieces have 3 + 2 + 1 = 6 cells, the same area as the figure. The fewest moves are 4: three placements and one rotation (hexablock-app#60), so the third star can be won.

## Complete Sort example

The board is the hex board of radius 2, with 19 cells. The player clears 3 stacks to win. The source draws stacks from seed 20261115 with three colors.

```json
{
  "gameId": "sort",
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
```

A level with a fixed source writes the stacks in place of the seed and the colors. Only the `source` field changes:

```json
{
  "stacks": [["red", "red", "blue"], ["green"], ["blue", "green"]]
}
```
