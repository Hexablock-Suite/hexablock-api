import { GameId } from '../../../src/domain/progress/game-id.js';
import { LevelId } from '../../../src/domain/progress/level-id.js';
import { LevelOrder } from '../../../src/domain/level/level-order.js';
import { LevelVersion } from '../../../src/domain/level/level-version.js';
import { TopologyId } from '../../../src/domain/level/topology-id.js';
import { appLevelJson, SQUARE_AND_TRIANGLE_FIT_LEVELS } from '../../support/app-levels.js';
import { type LevelJson, levelValidators, valueOf } from '../../support/level-format.js';

// #229: the API holds every bundled level of the app (#158, option A), so
// each bundled Fit level on the square and the triangle topologies passes
// the checks of the composition root, A5 included.
function checked(json: LevelJson) {
  return levelValidators().check(
    valueOf(GameId.of(json.gameId)),
    valueOf(LevelId.of(json.levelId)),
    valueOf(LevelOrder.of(json.order)),
    valueOf(LevelVersion.of(json.version)),
    valueOf(TopologyId.of(json.topology)),
    json.section,
  );
}

describe('bundled square and triangle Fit levels of the app', () => {
  // fit-triangle-01 places three pieces at [0, 0] with rotations 1, 4 and
  // 0. Only a turn and a move of the triangle topology cover its figure, the
  // six triangles around the origin vertex.
  it('should_build_the_level_when_fit_triangle_01_is_checked', () => {
    expect(checked(appLevelJson('fit-triangle-01')).ok).toBe(true);
  });

  it('should_build_each_level_when_the_six_bundled_square_and_triangle_files_are_checked', () => {
    expect(
      SQUARE_AND_TRIANGLE_FIT_LEVELS.map((name) => [name, checked(appLevelJson(name)).ok]),
    ).toEqual(SQUARE_AND_TRIANGLE_FIT_LEVELS.map((name) => [name, true]));
  });
});
