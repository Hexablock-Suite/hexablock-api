import type { GameId } from '../../domain/progress/game-id.js';
import type { LevelResult } from '../../domain/progress/level-result.js';
import { PlayerProgress } from '../../domain/progress/player-progress.js';
import { ProgressKey } from '../../domain/progress/progress-key.js';
import type { Score } from '../../domain/progress/score.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import type { UserId } from '../../domain/user/user-id.js';
import type { UseCase } from '../use-case.js';
import type { Clock } from '../ports/clock.js';
import type { LevelRepository } from '../ports/level-repository.js';
import type { ProgressRepository } from '../ports/progress-repository.js';
import type { ProgressProblem } from './progress-problem.js';

// The input of SyncProgress. The userId comes from the bearer token. The
// score is absent for a variant that keeps only level results. The mapper
// of the border builds every value, so the use case builds none from a
// loose primitive.
export interface SyncProgressRequest {
  readonly userId: UserId;
  readonly gameId: GameId;
  readonly score?: Score;
  readonly results: readonly LevelResult[];
}

// Input port of the progress sync (API-FR-02).
export type SyncProgress = UseCase<SyncProgressRequest, Result<PlayerProgress, ProgressProblem>>;

export const SYNC_PROGRESS = Symbol('SyncProgress');

// Changes the one progress of the user and the game, or starts it. The key
// of the progress joins the userId and the gameId of the request. It
// records the score and the level results at the Clock instant. The whole
// read, change and save runs under the lock of ProgressRepository.update(),
// so two overlapping syncs of one key run one after the other and lose no
// data (DEF-01, DEF-02). The mapper of the border builds every value, so a
// sync has no broken value to report. The Clock gives a SyncInstant, which
// guards the rule of a valid instant, so the use case checks no instant. A
// guard of the aggregate that throws is a defect of the caller, and a Clock
// that throws is a fault of the server. In both cases the use case throws
// and saves nothing (decision 11). Before the lock, the use case checks each
// result against its level (DS-6, #135): the API must hold a valid level of
// the result, and the result carries no more stars than the level has star
// thresholds. A broken rule returns its problem and saves nothing. The
// levels are other aggregates, so the use case reads them and changes none.
export class SyncProgressUseCase implements SyncProgress {
  constructor(
    private readonly progress: ProgressRepository,
    private readonly levels: LevelRepository,
    private readonly clock: Clock,
  ) {}

  async execute(request: SyncProgressRequest): Promise<Result<PlayerProgress, ProgressProblem>> {
    const { score, results } = request;
    const key = ProgressKey.of(request.userId, request.gameId);
    // ProgressKey.of() has no expected failure: its error type is never.
    if (!key.ok) {
      return key.error;
    }
    const levelProblem = await this.levelProblemOf(request.gameId, results);
    if (levelProblem !== undefined) {
      return err(levelProblem);
    }
    let outcome: Result<PlayerProgress, ProgressProblem> | undefined;
    await this.progress.update(key.value, (stored) => {
      // The use case reads the Clock under the lock, so the instants follow
      // the order of the saves. The aggregate keeps updatedAt from moving
      // back in any case.
      const at = this.clock.now();
      const progress = stored ?? PlayerProgress.start(key.value, at);
      if (score !== undefined) {
        progress.recordScore(score, at);
      }
      for (const result of results) {
        progress.recordLevel(result, at);
      }
      outcome = ok(progress);
      return progress;
    });
    if (outcome === undefined) {
      throw new Error('ProgressRepository.update() must run the change.');
    }
    return outcome;
  }

  // The first result, in the order of the request, that no valid level
  // admits, or undefined. A sync with no result reads no level, so Lines
  // and Merge need none. list() gives the valid levels apart from the
  // broken rows, so a broken row holds no level here (#147).
  private async levelProblemOf(
    gameId: GameId,
    results: readonly LevelResult[],
  ): Promise<ProgressProblem | undefined> {
    if (results.length === 0) {
      return undefined;
    }
    const { levels } = await this.levels.list();
    for (const result of results) {
      const level = levels.find((held) => held.isLevelOf(gameId, result));
      if (level === undefined) {
        return { kind: 'unknown-level', result };
      }
      if (!level.admits(result)) {
        return { kind: 'too-many-stars', result, most: level.mostStars() };
      }
    }
    return undefined;
  }
}
