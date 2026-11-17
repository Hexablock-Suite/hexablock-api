import type { GameId } from '../../domain/progress/game-id.js';
import type { LevelResult } from '../../domain/progress/level-result.js';
import { PlayerProgress } from '../../domain/progress/player-progress.js';
import { ProgressKey } from '../../domain/progress/progress-key.js';
import type { Score } from '../../domain/progress/score.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import type { UserId } from '../../domain/user/user-id.js';
import type { UseCase } from '../use-case.js';
import type { Clock } from '../ports/clock.js';
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
// and saves nothing (decision 11). When the repository knows no user with
// the userId, the sync fails with unknown-user and saves nothing (#137).
export class SyncProgressUseCase implements SyncProgress {
  constructor(
    private readonly progress: ProgressRepository,
    private readonly clock: Clock,
  ) {}

  async execute(request: SyncProgressRequest): Promise<Result<PlayerProgress, ProgressProblem>> {
    const { score, results } = request;
    const key = ProgressKey.of(request.userId, request.gameId);
    const saved = await this.progress.update(key, (stored) => {
      // The use case reads the Clock under the lock, so the instants follow
      // the order of the saves. The aggregate keeps updatedAt from moving
      // back in any case.
      const at = this.clock.now();
      const progress = stored ?? PlayerProgress.start(key, at);
      if (score !== undefined) {
        progress.recordScore(score, at);
      }
      for (const result of results) {
        progress.recordLevel(result, at);
      }
      return progress;
    });
    if (!saved.ok) {
      return err({ kind: saved.error });
    }
    // The change never returns null, so a saved progress is always there.
    if (saved.value === null) {
      throw new Error('ProgressRepository.update() must save the change.');
    }
    return ok(saved.value);
  }
}
