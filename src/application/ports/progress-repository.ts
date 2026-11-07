import type { GameId } from '../../domain/progress/game-id.js';
import type { PlayerProgress } from '../../domain/progress/player-progress.js';
import type { UserId } from '../../domain/user/user-id.js';

// One change of one progress. It gets the stored aggregate, or null when
// none is stored. It returns the aggregate to save, or null to save nothing.
// It is synchronous domain code and does no I/O.
export type ProgressChange = (stored: PlayerProgress | null) => PlayerProgress | null;

// Port. It finds and changes the whole PlayerProgress aggregate, one per
// userId and gameId. It names no table and no library type.
export interface ProgressRepository {
  // Gives the level results in ascending levelId order. It compares the
  // levelId values as text, not as numbers: fit-10 comes before fit-9.
  find(userId: UserId, gameId: GameId): Promise<PlayerProgress | null>;

  // Runs the change while it holds a lock for the userId and the gameId,
  // and saves what the change returns. The change gets the stored
  // aggregate with its level results in the order of find(). Two updates of one key run one after
  // the other, so each change reads what the previous one saved. The
  // promise resolves to the value that the change returns. When the change
  // throws, the repository saves nothing and rejects with that error.
  update(userId: UserId, gameId: GameId, change: ProgressChange): Promise<PlayerProgress | null>;
}

// Nest injection token for the ProgressRepository port.
export const PROGRESS_REPOSITORY = Symbol('ProgressRepository');
