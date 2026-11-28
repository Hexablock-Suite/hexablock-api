import type { IncomingLevel } from '../../src/application/levels/update-levels.use-case.js';
import { LevelOrder } from '../../src/domain/level/level-order.js';
import { LevelVersion } from '../../src/domain/level/level-version.js';
import { TopologyId } from '../../src/domain/level/topology-id.js';
import { GameId } from '../../src/domain/shared/game-id.js';
import { LevelId } from '../../src/domain/shared/level-id.js';
import { levelJson, type LevelJson, valueOf } from './level-format.js';

// Fixtures of the level update (#81): a level that fails A5, and the
// request of UpdateLevels as LevelDtoMapper builds it.

// The Fit level of the format document with a witness that fails A5. Piece
// c moves to [2, 1], which piece b covers too, so the cell [1, 1] stays
// open. The areas stay equal, so the problem is inexact-witness.
export function a5FailingFitJson(levelId = 'fit-01', version = 1): LevelJson {
  const json = levelJson('hexa-fit', levelId, version);
  const witness = [
    { piece: 'a', rotation: 0, at: [0, 0] },
    { piece: 'b', rotation: 1, at: [2, 0] },
    { piece: 'c', rotation: 0, at: [2, 1] },
  ];
  return { ...json, section: { ...json.section, witness } };
}

// One level of an update request, as LevelDtoMapper builds it: the values
// of the common part as domain values, and the section as it arrives.
export function incomingLevel(json: LevelJson): IncomingLevel {
  return {
    gameId: valueOf(GameId.of(json.gameId)),
    levelId: valueOf(LevelId.of(json.levelId)),
    order: valueOf(LevelOrder.of(json.order)),
    version: valueOf(LevelVersion.of(json.version)),
    topology: valueOf(TopologyId.of(json.topology)),
    section: json.section,
  };
}
