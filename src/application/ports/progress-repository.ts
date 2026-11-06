import type { GameId } from '../../domain/progress/game-id.js';
import type { PlayerProgress } from '../../domain/progress/player-progress.js';
import type { UserId } from '../../domain/progress/user-id.js';

// Port. It saves and finds the whole PlayerProgress aggregate, one per
// userId and gameId. It names no table and no library type.
export interface ProgressRepository {
  find(userId: UserId, gameId: GameId): Promise<PlayerProgress | null>;
  save(progress: PlayerProgress): Promise<void>;
}
