import { ProgressError } from './progress-error.js';

// Value object for the moves that a player uses in one level. It is a non-negative
// safe integer.
export class Moves {
  private constructor(readonly value: number) {}

  static of(value: number): Moves {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new ProgressError(`moves must be a non-negative integer, got ${value}.`);
    }
    return new Moves(value);
  }

  equals(other: Moves): boolean {
    return this.value === other.value;
  }

  // Fewer moves is the better result (DS-4). An equal count is not fewer.
  isFewerThan(other: Moves): boolean {
    return this.value < other.value;
  }
}
