import { ProgressError } from './progress-error.js';

// Value object for the id of a user. PlayerProgress refers to a user by this
// id only.
export class UserId {
  private constructor(readonly value: string) {}

  static of(value: string): UserId {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new ProgressError('userId must be a non-blank string.');
    }
    return new UserId(value);
  }

  equals(other: UserId): boolean {
    return this.value === other.value;
  }
}
