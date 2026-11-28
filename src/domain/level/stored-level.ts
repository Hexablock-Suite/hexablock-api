import type { GameIdProblem } from '../shared/game-id.js';
import type { LevelIdProblem } from '../shared/level-id.js';
import type { LevelProblem } from './level-problem.js';

// The code of the first rule that a stored level breaks. The restore of a
// stored level checks its values in the order of the level format, so a
// broken gameId or levelId comes before a level problem.
export type StoredLevelProblem = GameIdProblem | LevelIdProblem | LevelProblem;
