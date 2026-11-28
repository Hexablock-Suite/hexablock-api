import type { LevelFinder } from '../../src/application/ports/level-repository.js';
import { LevelDefinition } from '../../src/domain/level/level-definition.js';
import { LevelOrder } from '../../src/domain/level/level-order.js';
import { LevelVersion } from '../../src/domain/level/level-version.js';
import { TopologyId } from '../../src/domain/level/topology-id.js';
import { GameId } from '../../src/domain/shared/game-id.js';
import { LevelId } from '../../src/domain/shared/level-id.js';
import type { LevelResult } from '../../src/domain/progress/level-result.js';
import { ok } from '../../src/domain/shared/result.js';
import { testSection } from './level-format.js';
import { valueOf } from './result.js';

// The levels of one game that a test needs: the gameId, the levelIds, and
// the count of star thresholds of each level.
export type HeldGame = readonly [gameId: string, levelIds: readonly string[]];

// Test double for the LevelFinder role of the LevelRepository port, the one
// role that a sync depends on (#193). A sync reads the levels of all its
// results through one findFor() (#135, #171, #217). The
// double holds a level of each named gameId and levelId, with `stars` star
// thresholds, also for a game with no strategy, such as the slug fit of the
// concurrency suite. It holds no broken row, so findFor() gives each held
// level that one result names, through isLevelOf(). It has no other
// operation of the port, because a sync calls none.
export function heldLevels(games: readonly HeldGame[], stars = 3): LevelFinder {
  const levels = games.flatMap(([gameId, levelIds]) =>
    levelIds.map((levelId) =>
      valueOf(
        LevelDefinition.of(
          valueOf(GameId.of(gameId)),
          valueOf(LevelId.of(levelId)),
          valueOf(LevelOrder.of(1)),
          valueOf(LevelVersion.of(1)),
          valueOf(TopologyId.of('hex')),
          ok(testSection(`${gameId}/${levelId}`, stars)),
        ),
      ),
    ),
  );
  return {
    findFor: (gameId: GameId, results: readonly LevelResult[]) =>
      Promise.resolve(
        levels.filter((held) => results.some((result) => held.isLevelOf(gameId, result))),
      ),
  };
}
