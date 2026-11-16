import type { Score } from '../../../src/domain/progress/score.js';

// Wrong example: a get accessor and a set accessor.
export class Ledger {
  private constructor(private total: Score) {}

  get balance(): Score {
    return this.total;
  }

  set balance(score: Score) {
    this.total = score;
  }
}
