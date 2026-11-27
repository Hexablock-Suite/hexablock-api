import type { ListedLevels } from '../../src/application/levels/listed-levels.js';
import type { LevelRepository } from '../../src/application/ports/level-repository.js';
import { LevelDefinition } from '../../src/domain/level/level-definition.js';
import { LevelOrder } from '../../src/domain/level/level-order.js';
import { LevelVersion } from '../../src/domain/level/level-version.js';
import { TopologyId } from '../../src/domain/level/topology-id.js';
import { GameId } from '../../src/domain/progress/game-id.js';
import { LevelId } from '../../src/domain/progress/level-id.js';
import type { LevelResult } from '../../src/domain/progress/level-result.js';
import { ok } from '../../src/domain/shared/result.js';
import { testSection } from './level-format.js';
import { valueOf } from './result.js';

// The levels of one game that a test needs: the gameId, the levelIds, and
// the count of star thresholds of each level.
export type HeldGame = readonly [gameId: string, levelIds: readonly string[]];

// Test double for the LevelRepository port of a sync. A sync reads one level
// per result through find() (#135, #171). The double holds a level of each
// named gameId and levelId, with `stars` star thresholds, also for a game
// with no strategy, such as the slug fit of the concurrency suite. It holds
// no broken row, so find() answers the level of the key that its result
// names, or undefined. A sync never updates a level, so holds() and
// update() throw.
export function heldLevels(games: readonly HeldGame[], stars = 3): LevelRepository {
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
  const listed: ListedLevels = { levels, unavailable: [] };
  return {
    list: () => Promise.resolve(listed),
    find: (gameId: GameId, result: LevelResult) =>
      Promise.resolve(levels.find((held) => held.isLevelOf(gameId, result))),
    holds: () => Promise.reject(new Error('A sync asks no holds().')),
    update: () => Promise.reject(new Error('A sync updates no level.')),
  };
}
