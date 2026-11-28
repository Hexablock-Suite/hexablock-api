import type { Score } from '../../../src/domain/progress/score.js';
import type { UserId } from '../../../src/domain/shared/user-id.js';

// Wrong example: an exported interface with public fields.
export interface ScoreState {
  readonly userId: UserId;
  readonly best: Score;
}
