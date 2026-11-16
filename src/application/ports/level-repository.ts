import type { LevelDefinition } from '../../domain/level/level-definition.js';
import type { LevelProblem } from '../../domain/level/level-problem.js';
import type { GameId } from '../../domain/progress/game-id.js';
import type { LevelId } from '../../domain/progress/level-id.js';
import type { Result } from '../../domain/shared/result.js';

// One change of one level. It gets the stored level, or null when none is
// stored. It returns the level to save, or a failed Result to save nothing,
// for example the older-version of LevelDefinition.accepts() (S3-10). The
// level that it returns has the gameId and the levelId of the update. It is
// synchronous domain code and does no I/O.
export type LevelChange = (
  stored: LevelDefinition<unknown> | null,
) => Result<LevelDefinition<unknown>, LevelProblem>;

// Port. It lists and changes the LevelDefinition aggregates, one per gameId
// and levelId (API-FR-04, DS-6). Each level is the root of its own aggregate,
// so one update() changes one level. It names no table and no library type.
export interface LevelRepository {
  // Gives every stored level, by gameId and then by levelId. It compares the
  // values as text, not as numbers: fit-10 comes before fit-9. Each level is
  // valid: its section passed the strategy of its gameId.
  list(): Promise<readonly LevelDefinition<unknown>[]>;

  // Runs the change while it holds a lock for the gameId and the levelId,
  // and saves the level that the change returns. Two updates of one level
  // run one after the other, so each change reads what the previous one
  // saved, and the version rule that the change runs cannot let an older
  // copy win a race. The promise resolves to the Result that the change
  // returns. When the change throws, or returns a level with another gameId
  // or levelId, the repository saves nothing and rejects.
  update(
    gameId: GameId,
    levelId: LevelId,
    change: LevelChange,
  ): Promise<Result<LevelDefinition<unknown>, LevelProblem>>;
}

// Nest injection token for the LevelRepository port.
export const LEVEL_REPOSITORY = Symbol('LevelRepository');
