import { err, ok, type Result } from '../shared/result.js';
import type { ValueReceiver } from '../shared/value-receiver.js';

// The code of the broken rule. The border writes the message (decision 11).
export type LevelIdProblem = 'invalid-level-id';

// Value object for the id of one level of a game, such as fit-01. The id is
// a non-blank text, kept as it arrives.
export class LevelId {
  private constructor(private readonly value: string) {}

  // Builds a levelId that the API already holds: a stored row. A stored row
  // keeps what it holds, so this factory has no length or character bound.
  static of(value: string): Result<LevelId, LevelIdProblem> {
    return typeof value === 'string' && value.trim() !== ''
      ? ok(new LevelId(value))
      : err('invalid-level-id');
  }

  // Delivers the value to a receiver of the border. No operation returns it.
  deliverTo(receiver: ValueReceiver<string>): void {
    receiver.receive(this.value);
  }

  equals(other: LevelId): boolean {
    return this.value === other.value;
  }
}
