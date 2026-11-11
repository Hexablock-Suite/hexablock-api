import type { ValueReceiver } from '../shared/value-receiver.js';
import { ProgressError } from './progress-error.js';

// Value object for the score of one game. A score is a non-negative safe
// integer. -0 counts as a zero score.
export class Score {
  private constructor(private readonly value: number) {}

  static of(value: number): Score {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new ProgressError(`score must be a non-negative integer, got ${value}.`);
    }
    return new Score(value);
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
