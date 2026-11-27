import type { LevelDefinition } from '../../domain/level/level-definition.js';
import type { StoredLevelProblem } from '../../domain/level/stored-level.js';

// A stored level row that breaks a rule (#147). The key is the text of the
// row, because a broken row can hold a gameId or a levelId that breaks its
// own rule. The reason is the code of the first broken rule.
export interface UnavailableLevel {
  readonly gameId: string;
  readonly levelId: string;
  readonly reason: StoredLevelProblem;
}

// Every stored level row, by gameId and then by levelId: the valid levels
// and the broken rows apart. One broken row hides no other level (#147).
// It is the response of the GetLevels input port, so it lives next to that
// use case. The LevelRepository port imports it from here (#213).
export interface ListedLevels {
  readonly levels: readonly LevelDefinition<unknown>[];
  readonly unavailable: readonly UnavailableLevel[];
}
