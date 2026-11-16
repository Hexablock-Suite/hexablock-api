import { err, ok, type Result } from '../shared/result.js';
import type { ValueReceiver } from '../shared/value-receiver.js';

// The code of the broken rule. The border writes the message (decision 11).
export type ScoreProblem = 'invalid-score';

// Value object for the score of one game. A score is a non-negative safe
// integer. -0 counts as a zero score.
export class Score {
  private constructor(private readonly value: number) {}

  static of(value: number): Result<Score, ScoreProblem> {
    return Number.isSafeInteger(value) && value >= 0 ? ok(new Score(value)) : err('invalid-score');
  }

  // Delivers the value to a receiver of the border. No operation returns it.
  deliverTo(receiver: ValueReceiver<number>): void {
    receiver.receive(this.value);
  }

  equals(other: Score): boolean {
    return this.value === other.value;
  }

  // An equal score is not higher, so the caller keeps the score it has.
  isHigherThan(other: Score): boolean {
    return this.value > other.value;
  }
}
