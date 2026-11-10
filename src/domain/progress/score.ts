import { ProgressError } from './progress-error.js';

// Value object for the score of one game. A score is a non-negative safe
// integer. -0 counts as a zero score.
export class Score {
  private constructor(readonly value: number) {}

  static of(value: number): Score {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new ProgressError(`score must be a non-negative integer, got ${value}.`);
    }
    return new Score(value);
  }

  equals(other: Score): boolean {
    return this.value === other.value;
  }

  // An equal score is not higher, so the caller keeps the score it has.
  isHigherThan(other: Score): boolean {
    return this.value > other.value;
  }
}
