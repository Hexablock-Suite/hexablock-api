import type { GameId } from '../../domain/progress/game-id.js';
import type { PlayerProgress } from '../../domain/progress/player-progress.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import type { UserId } from '../../domain/user/user-id.js';
import type { UseCase } from '../use-case.js';
import type { ProgressRepository } from '../ports/progress-repository.js';
import type { ProgressProblem } from './progress-problem.js';

// The input of GetProgress. The userId comes from the bearer token. The
// mapper of the border builds the GameId.
export interface GetProgressRequest {
  readonly userId: UserId;
  readonly gameId: GameId;
}

// Input port of the progress read per gameId (API-FR-02).
export type GetProgress = UseCase<GetProgressRequest, Result<PlayerProgress, ProgressProblem>>;

export const GET_PROGRESS = Symbol('GetProgress');

// Finds the one progress of the user and the game.
export class GetProgressUseCase implements GetProgress {
  constructor(private readonly progress: ProgressRepository) {}

  async execute(request: GetProgressRequest): Promise<Result<PlayerProgress, ProgressProblem>> {
    const stored = await this.progress.find(request.userId, request.gameId);
    return stored === null ? err({ kind: 'progress-not-found' }) : ok(stored);
  }
}
