import type { ElapsedTime } from '../../progress/elapsed-time.js';
import type { Moves } from '../../progress/moves.js';
import { ok, type Result } from '../../shared/result.js';
import type { LevelProblem } from '../level-problem.js';
import { readFields } from '../parts.js';
import { maxElapsedTimeIn, maxMovesIn } from '../star-limits.js';

// Value object for the two limits of one Fit star: a move count and a time.
// A Fit star needs both (DS-6, hexablock-app#60). The stars are cumulative:
// star N needs star N-1.
export class FitStarThreshold {
  private constructor(
    private readonly maxMoves: Moves,
    private readonly maxElapsedTime: ElapsedTime,
  ) {}

  // Reads { maxMoves, maxElapsedMs }. Each limit is a non-negative safe integer.
  static of(raw: unknown): Result<FitStarThreshold, LevelProblem> {
    const threshold = readFields(
      raw,
      { maxMoves: maxMovesIn, maxElapsedMs: maxElapsedTimeIn },
      'invalid-star-threshold',
    );
    return threshold.ok
      ? ok(new FitStarThreshold(threshold.value.maxMoves, threshold.value.maxElapsedMs))
      : threshold;
  }

  // Two thresholds are equal when their two limits are equal.
  equals(other: FitStarThreshold): boolean {
    return this.maxMoves.equals(other.maxMoves) && this.maxElapsedTime.equals(other.maxElapsedTime);
  }
}
