import { GameId } from '../../domain/progress/game-id.js';
import { LevelResult, type LevelResultValues } from '../../domain/progress/level-result.js';
import { PlayerProgress } from '../../domain/progress/player-progress.js';
import { ok, type Result } from '../../domain/shared/result.js';
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

// Loads the one progress of the user and the game, or starts it, records the
// score and the level results at the Clock instant, and saves it. A broken
// rule saves nothing.
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
    const at = this.clock.now();
    const stored = await this.progress.find(request.userId, gameId);
    const updated = withProgressRules(() => {
      const progress = stored ?? PlayerProgress.start(request.userId, gameId, at);
      if (request.score !== undefined) {
        progress.recordScore(request.score, at);
      }
      for (const result of results) {
        progress.recordLevel(result);
      }
      return progress;
    });
    if (!updated.ok) {
      return updated;
    }
    await this.progress.save(updated.value);
    return ok(updated.value);
  }
}
