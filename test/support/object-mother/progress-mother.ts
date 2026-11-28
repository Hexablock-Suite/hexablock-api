import type { LevelResultValues } from '../../../src/adapters/received.js';
import { GameId } from '../../../src/domain/shared/game-id.js';
import type { LevelResult } from '../../../src/domain/progress/level-result.js';
import { PlayerProgress } from '../../../src/domain/progress/player-progress.js';
import { ProgressKey } from '../../../src/domain/progress/progress-key.js';
import type { SyncInstant } from '../../../src/domain/progress/sync-instant.js';
import { levelResultOf } from '../level-results.js';
import { valueOf } from '../result.js';
import { syncInstantOf } from '../sync-instants.js';
import { UserMother } from './user-mother.js';

const START_TIME = new Date('2026-11-06T10:00:00.000Z');
const FIVE_MINUTES_MS = 5 * 60 * 1000;

// Object Mother of the progress data of the tests. It builds domain values
// with the public factories only, and it knows no test double.
export class ProgressMother {
  // The instant of the first sync of a test.
  static readonly START: SyncInstant = syncInstantOf(START_TIME);
  // Five minutes after START.
  static readonly FIVE_MINUTES_LATER: SyncInstant = syncInstantOf(
    new Date(START_TIME.getTime() + FIVE_MINUTES_MS),
  );
  static readonly FIVE_MINUTES_MS = FIVE_MINUTES_MS;

  static gameId(gameId: string): GameId {
    return valueOf(GameId.of(gameId));
  }

  // The key of the progress of user n in one game (#107).
  static key(user: number, gameId: string): ProgressKey {
    return ProgressKey.of(UserMother.id(user), ProgressMother.gameId(gameId));
  }

  // A new progress of user n in one game, with no score and no result.
  static startedBy(user: number, gameId: string): PlayerProgress {
    return PlayerProgress.start(ProgressMother.key(user, gameId), ProgressMother.START);
  }

  // A LevelResult from plain values, as the mapper of the border builds it.
  static levelResult(values: LevelResultValues): LevelResult {
    return levelResultOf(values);
  }
}
