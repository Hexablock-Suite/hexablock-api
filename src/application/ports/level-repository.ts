import type { LevelDefinition, StoredLevel } from '../../domain/level/level-definition.js';
import type { LevelProblem } from '../../domain/level/level-problem.js';
import type { GameId } from '../../domain/shared/game-id.js';
import type { LevelId } from '../../domain/shared/level-id.js';
import type { LevelResult } from '../../domain/progress/level-result.js';
import type { Result } from '../../domain/shared/result.js';
import type { ListedLevels } from '../levels/listed-levels.js';

// One change of one level. It gets the stored state of the level. It
// returns the level to save, or a failed Result to save nothing, for
// example the older-version of LevelDefinition.decideReplace() (S3-10,
// #174). The level that it returns has the gameId and the levelId of the
// update, and it replaces a valid or a broken row. It is synchronous
// domain code and does no I/O.
export type LevelChange = (stored: StoredLevel) => Result<LevelDefinition, LevelProblem>;

// Role of the level store for GetLevelsUseCase (API-FR-04): it lists every
// stored row. The roles split the port by client, so no use case depends on
// an operation that it does not call (statement §3.2, ISP; decision 23,
// #193).
export interface LevelLister {
  // Gives every stored row, by gameId and then by levelId. It compares the
  // values as text, not as numbers: fit-10 comes before fit-9. A row whose
  // section passed the strategy of its gameId is a valid level. Any other
  // row is an unavailable level.
  list(): Promise<ListedLevels>;
}

// Role of the level store for GetLevelLeaderboardUseCase (API-FR-03): it
// answers whether the level definitions hold a level (#146).
export interface LevelHolder {
  // Answers whether a row is stored for the gameId and the levelId: true
  // for a valid row and for a broken row, false when no row is stored. A
  // broken row is still a level that the definitions hold, so the board of
  // that level exists (#146). It takes no lock and restores no level.
  holds(gameId: GameId, levelId: LevelId): Promise<boolean>;
}

// Role of the level store for SyncProgressUseCase (API-FR-02): it finds the
// levels of the results of one sync (#217).
export interface LevelFinder {
  // Gives the valid levels of the gameId that the results name, by levelId,
  // in one read: the level of each stored valid row whose levelId one result
  // names. A row that is absent or that breaks a rule (decision 19, #147)
  // gives no level, and two results of one level give that level once. The
  // query takes the results because the domain gives no getter of the
  // levelId of a LevelResult, and rule R-no-delivery-call keeps its
  // delivery out of layer 2: each adapter receives the levelIds in the
  // border (decision 22, #217). A sync reads no level that its results do
  // not name (#171). It takes no lock and saves no level.
  findFor(gameId: GameId, results: readonly LevelResult[]): Promise<readonly LevelDefinition[]>;
}

// Role of the level store for UpdateLevelsUseCase (API-FR-04): it changes
// one level under the lock of that level (S3-10).
export interface LevelUpdater {
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
  ): Promise<Result<LevelDefinition, LevelProblem>>;
}

// Port. The one repository of the LevelDefinition aggregates, one per gameId
// and levelId (API-FR-04, DS-6). Each level is the root of its own aggregate,
// so one update() changes one level. It names no table and no library type.
// It is the composition of the four roles above, one per client: an adapter
// implements the whole port, and each use case holds only its role
// (decision 23, #193). AppModule gives the one instance of LEVEL_REPOSITORY
// to each use case.
export interface LevelRepository extends LevelLister, LevelHolder, LevelFinder, LevelUpdater {}

// Nest injection token for the LevelRepository port.
export const LEVEL_REPOSITORY = Symbol('LevelRepository');
