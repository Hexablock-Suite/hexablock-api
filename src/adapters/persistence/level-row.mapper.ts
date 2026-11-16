import type { LevelDefinition } from '../../domain/level/level-definition.js';
import { LevelOrder } from '../../domain/level/level-order.js';
import type { LevelProblem } from '../../domain/level/level-problem.js';
import type { LevelValidators } from '../../domain/level/level-validators.js';
import { LevelVersion } from '../../domain/level/level-version.js';
import { TopologyId } from '../../domain/level/topology-id.js';
import { GameId } from '../../domain/progress/game-id.js';
import { LevelId } from '../../domain/progress/level-id.js';
import type { Result } from '../../domain/shared/result.js';
import { receiveJsonOf, receiveValueOf } from '../received.js';
import type { levels } from './schema.js';

export type LevelRow = typeof levels.$inferSelect;

// Turns a levels row into a LevelDefinition and back (DS-6, classes.md
// decision 5). A level is born valid (#77), also from the database:
// toLevel() builds the values of the common part and asks LevelValidators
// for the strategy of the row's gameId, which builds the section. The mapper
// never picks a section type, so a new variant with level files changes no
// code here. A row that no strategy accepts is a server fault, so toLevel()
// throws. toRow() receives the value of each part, and the section delivers
// its parts as the JSON of the shared level format.
export const LevelRowMapper = {
  toLevel(row: LevelRow, validators: LevelValidators): LevelDefinition<unknown> {
    const level = restored(row, validators);
    if (!level.ok) {
      throw new Error(
        `The levels row ${row.gameId}/${row.levelId} breaks the level rule ${level.error}.`,
      );
    }
    return level.value;
  },

  toRow(level: LevelDefinition<unknown>): LevelRow {
    const { gameId, levelId, order, version, topology, section } = receiveValueOf(level);
    return {
      gameId: receiveValueOf(gameId),
      levelId: receiveValueOf(levelId),
      order: receiveValueOf(order),
      version: receiveValueOf(version),
      topology: receiveValueOf(topology),
      section: receiveJsonOf(section),
    };
  },
};

// The first broken value stops the restore, in the order of the format.
// GameId and LevelId still throw their ProgressError until #103.
function restored(
  row: LevelRow,
  validators: LevelValidators,
): Result<LevelDefinition<unknown>, LevelProblem> {
  const order = LevelOrder.of(row.order);
  if (!order.ok) return order;
  const version = LevelVersion.of(row.version);
  if (!version.ok) return version;
  const topology = TopologyId.of(row.topology);
  if (!topology.ok) return topology;
  return validators.check(
    GameId.of(row.gameId),
    LevelId.of(row.levelId),
    order.value,
    version.value,
    topology.value,
    row.section,
  );
}
