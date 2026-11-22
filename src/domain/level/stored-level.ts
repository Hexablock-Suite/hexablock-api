import type { GameIdProblem } from '../progress/game-id.js';
import type { LevelIdProblem } from '../progress/level-id.js';
import type { LevelDefinition } from './level-definition.js';
import type { LevelProblem } from './level-problem.js';
import type { LevelVersion } from './level-version.js';

// The code of the first rule that a stored level row breaks. The row
// mapper checks the values in the order of the level format, so a broken
// gameId or levelId comes before a level problem.
export type StoredLevelProblem = GameIdProblem | LevelIdProblem | LevelProblem;

// What the store holds for one gameId and levelId, read under the lock of
// update() (#147). The three states are closed, so a change handles each:
// - absent: no row.
// - valid: a row that the strategy of its gameId restores into a level.
// - broken: a row that breaks a rule. It has no level. It gives the code of
//   its first broken rule and its stored version, or null when the version
//   column itself breaks the rule of LevelVersion. So a broken row never
//   passes as no row.
export type StoredLevel =
  | { readonly state: 'absent' }
  | { readonly state: 'valid'; readonly level: LevelDefinition<unknown> }
  | {
      readonly state: 'broken';
      readonly reason: StoredLevelProblem;
      readonly version: LevelVersion | null;
    };
