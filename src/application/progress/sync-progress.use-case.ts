import { GameId } from '../../domain/progress/game-id.js';
import { LevelResult, type LevelResultValues } from '../../domain/progress/level-result.js';
import { PlayerProgress } from '../../domain/progress/player-progress.js';
import { Score } from '../../domain/progress/score.js';
import type { Result } from '../../domain/shared/result.js';
import type { UserId } from '../../domain/user/user-id.js';
import type { UseCase } from '../use-case.js';
import type { Clock } from '../ports/clock.js';
import type { ProgressRepository } from '../ports/progress-repository.js';
import { type ProgressProblem, withProgressRules } from './progress-problem.js';

// The input of SyncProgress. The userId comes from the bearer token. The
// score is absent for a variant that keeps only level results.
export interface SyncProgressRequest {
  readonly userId: UserId;
  readonly gameId: string;
  readonly score?: number;
  readonly results: readonly LevelResultValues[];
}

// Input port of the progress sync (API-FR-02).
export type SyncProgress = UseCase<SyncProgressRequest, Result<PlayerProgress, ProgressProblem>>;

export const SYNC_PROGRESS = Symbol('SyncProgress');

// Changes the one progress of the user and the game, or starts it. It
// records the score and the level results at the Clock instant. The whole
// read, change and save runs under the lock of ProgressRepository.update(),
// so two overlapping syncs of one key run one after the other and lose no
// data (DEF-01, DEF-02). A broken rule saves nothing. A Clock that gives an
// invalid Date is a fault of the server, so the use case throws and saves
// nothing (decision 11).
export class SyncProgressUseCase implements SyncProgress {
  constructor(
    private readonly progress: ProgressRepository,
    private readonly clock: Clock,
  ) {}

  async execute(request: SyncProgressRequest): Promise<Result<PlayerProgress, ProgressProblem>> {
    const values = withProgressRules(() => ({
      gameId: GameId.of(request.gameId),
      results: request.results.map((result) => LevelResult.of(result)),
    }));
    if (!values.ok) {
      return values;
    }
    const { gameId, results } = values.value;
    let outcome: Result<PlayerProgress, ProgressProblem> | undefined;
    await this.progress.update(request.userId, gameId, (stored) => {
      // The use case reads the Clock under the lock. So updatedAt follows
      // the order of the saves and never moves back.
      const at = this.clock.now();
      if (!(at instanceof Date) || Number.isNaN(at.getTime())) {
        throw new Error('The Clock must return a valid Date.');
      }
      outcome = withProgressRules(() => {
        const progress = stored ?? PlayerProgress.start(request.userId, gameId, at);
        if (request.score !== undefined) {
          progress.recordScore(Score.of(request.score), at);
        }
        for (const result of results) {
          progress.recordLevel(result);
        }
        return progress;
      });
      return outcome.ok ? outcome.value : null;
    });
    if (outcome === undefined) {
      throw new Error('ProgressRepository.update() must run the change.');
    }
    return outcome;
  }
}
