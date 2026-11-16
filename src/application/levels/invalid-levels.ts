import type { LevelProblem } from '../../domain/level/level-problem.js';
import type { GameId } from '../../domain/progress/game-id.js';
import type { LevelId } from '../../domain/progress/level-id.js';

// One level problem of an update: the gameId and the levelId of the level,
// and the code of the rule that it breaks. The key tells a client which
// level to fix. The border writes the message (decision 11).
export interface LevelProblemReport {
  readonly gameId: GameId;
  readonly levelId: LevelId;
  readonly problem: LevelProblem;
}

// The expected failure of UpdateLevels (decision 11). It carries a kind, so
// LoggingAspect logs it and no value of a level. It holds one problem per
// broken level, in the order of the request.
export interface InvalidLevels {
  readonly kind: 'invalid-levels';
  readonly problems: readonly LevelProblemReport[];
}
