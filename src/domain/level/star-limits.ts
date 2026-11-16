import { ElapsedTime } from '../progress/elapsed-time.js';
import { Moves } from '../progress/moves.js';
import { err, type Result } from '../shared/result.js';
import type { LevelProblem } from './level-problem.js';

// Reads the move limit of one star threshold: a Moves value object. A limit
// that breaks the rule of Moves gives the level problem of a threshold.
export function maxMovesIn(raw: unknown): Result<Moves, LevelProblem> {
  if (typeof raw !== 'number') return err('invalid-star-threshold');
  const moves = Moves.of(raw);
  return moves.ok ? moves : err('invalid-star-threshold');
}

// Reads the time limit of one Fit star threshold: an ElapsedTime value
// object. A limit that breaks the rule of ElapsedTime gives the level problem
// of a threshold.
export function maxElapsedTimeIn(raw: unknown): Result<ElapsedTime, LevelProblem> {
  if (typeof raw !== 'number') return err('invalid-star-threshold');
  const elapsedTime = ElapsedTime.ofMs(raw);
  return elapsedTime.ok ? elapsedTime : err('invalid-star-threshold');
}
