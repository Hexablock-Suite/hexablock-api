import type { PlayerProgress } from '../../domain/progress/player-progress.js';
import type { ProgressKey } from '../../domain/progress/progress-key.js';
import type { Result } from '../../domain/shared/result.js';

// One change of one progress. It gets the stored aggregate, or null when
// none is stored. It returns the aggregate to save, or null to save nothing.
// It is synchronous domain code and does no I/O.
export type ProgressChange = (stored: PlayerProgress | null) => PlayerProgress | null;

// Port. It finds and changes the whole PlayerProgress aggregate, one per
// ProgressKey: a userId and a gameId. It names no table and no library type.
export interface ProgressRepository {
  // Gives the level results in ascending levelId order. It compares the
  // levelId values as text, not as numbers: fit-10 comes before fit-9.
  find(key: ProgressKey): Promise<PlayerProgress | null>;

  // Runs the change while it holds a lock for the key, and saves what the
  // change returns. The change gets the stored aggregate with its level
  // results in the order of find(). Two updates of one key run one after
  // the other, so each change reads what the previous one saved. The
  // promise resolves to the value that the change returns. When the change
  // throws, the repository saves nothing and rejects with that error. When
  // no user has the userId of the key, a save fails with unknown-user and
  // saves nothing (#137). A change that returns null saves nothing, so it
  // does not fail.
  update(
    key: ProgressKey,
    change: ProgressChange,
  ): Promise<Result<PlayerProgress | null, 'unknown-user'>>;
}

// Nest injection token for the ProgressRepository port.
export const PROGRESS_REPOSITORY = Symbol('ProgressRepository');
