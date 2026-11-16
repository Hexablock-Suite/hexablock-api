import type { Score } from '../../../src/domain/progress/score.js';

// Right example: an operation that answers a question returns a boolean.
export class Threshold {
  private constructor(private readonly score: Score) {}

  equals(other: Threshold): boolean {
    return this.score.equals(other.score);
  }

  isReachedBy(score: Score): boolean {
    return score.isHigherThan(this.score);
  }
}

export interface Gatekeeper {
  allows(score: Score): Promise<boolean>;
}
