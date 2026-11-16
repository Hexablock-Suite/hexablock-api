import { ElapsedTime } from '../progress/elapsed-time.js';
import { Moves } from '../progress/moves.js';
import { ProgressError } from '../progress/progress-error.js';
import { err, ok, type Result } from '../shared/result.js';
import type { LevelProblem } from './level-problem.js';

// Reads the move limit of one star threshold: a Moves value object.
export function maxMovesIn(raw: unknown): Result<Moves, LevelProblem> {
  return typeof raw === 'number' ? caught(() => Moves.of(raw)) : err('invalid-star-threshold');
}

// Reads the time limit of one Fit star threshold: an ElapsedTime value object.
export function maxElapsedTimeIn(raw: unknown): Result<ElapsedTime, LevelProblem> {
  return typeof raw === 'number'
    ? caught(() => ElapsedTime.ofMs(raw))
    : err('invalid-star-threshold');
}

// Moves.of() and ElapsedTime.ofMs() throw ProgressError until #103. This
// function turns that throw into a failed Result. So a bad level file gives a
// level problem and never a server error. Any other error is a defect, so it
// goes on.
function caught<T>(build: () => T): Result<T, LevelProblem> {
  try {
    return ok(build());
  } catch (error) {
    if (error instanceof ProgressError) {
      return err('invalid-star-threshold');
    }
    throw error;
  }
}
