import { err, ok, type Result } from '../shared/result.js';
import type { ValueReceiver } from '../shared/value-receiver.js';
import type { LevelProblem } from './level-problem.js';

// Value object for the version of a level (DS-6, DS-11). The first copy of a
// level has the version 1. A version is a safe integer of 1 or more.
export class LevelVersion {
  private constructor(private readonly value: number) {}

  static of(value: number): Result<LevelVersion, LevelProblem> {
    return Number.isSafeInteger(value) && value >= 1
      ? ok(new LevelVersion(value))
      : err('invalid-version');
  }

  // Delivers the value to a receiver of the border. No operation returns it.
  deliverTo(receiver: ValueReceiver<number>): void {
    receiver.receive(this.value);
  }

  equals(other: LevelVersion): boolean {
    return this.value === other.value;
  }

  // A lower version is older. DS-11: the copy with the higher version wins.
  // S3-10: the API rejects a copy that is older than the stored copy. An
  // equal version is not older.
  isOlderThan(other: LevelVersion): boolean {
    return this.value < other.value;
  }
}
