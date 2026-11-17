import {
  LEVEL_REPOSITORY,
  type LevelRepository,
} from '../../../src/application/ports/level-repository.js';
import type { LevelJson } from '../level-format.js';
import { storeLevel } from '../level-repository.contract.js';
import type { TestApp } from './test-app.js';

// Stores each level through the LevelRepository of the test app. The board
// of a level answers 404 until the definitions hold that level (#146), so a
// test that asks a level board stores the level first.
export async function storeLevels(testApp: TestApp, ...levels: LevelJson[]): Promise<void> {
  const repository = testApp.app.get<LevelRepository>(LEVEL_REPOSITORY);
  for (const level of levels) {
    const stored = await storeLevel(repository, level);
    if (!stored.ok) {
      throw new Error(`The test level ${level.gameId}/${level.levelId} was not stored.`);
    }
  }
}
