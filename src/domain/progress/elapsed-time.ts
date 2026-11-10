import { ProgressError } from './progress-error.js';

// Value object for the time that a player takes in one level, in milliseconds. It is a non-negative
// safe integer.
export class ElapsedTime {
  private constructor(readonly value: number) {}

  static ofMs(value: number): ElapsedTime {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new ProgressError(`elapsedMs must be a non-negative integer, got ${value}.`);
    }
    return new ElapsedTime(value);
  }

  equals(other: ElapsedTime): boolean {
    return this.value === other.value;
  }

  // Less time is the better result (DS-4). An equal time is not shorter.
  isShorterThan(other: ElapsedTime): boolean {
    return this.value < other.value;
  }
}
