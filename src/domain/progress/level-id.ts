import { ProgressError } from './progress-error.js';

// Value object for the id of one level of a game, such as fit-01. The id is
// a non-blank text, kept as it arrives.
export class LevelId {
  private constructor(readonly value: string) {}

  static of(value: string): LevelId {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new ProgressError('levelId must be a non-blank string.');
    }
    return new LevelId(value);
  }

  equals(other: LevelId): boolean {
    return this.value === other.value;
  }
}
