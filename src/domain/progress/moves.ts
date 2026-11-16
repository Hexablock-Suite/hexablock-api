import { err, ok, type Result } from '../shared/result.js';
import type { ValueReceiver } from '../shared/value-receiver.js';

// The code of the broken rule. The border writes the message (decision 11).
export type MovesProblem = 'invalid-moves';

// Value object for the moves that a player uses in one level. It is a non-negative
// safe integer.
export class Moves {
  private constructor(private readonly value: number) {}

  static of(value: number): Result<Moves, MovesProblem> {
    return Number.isSafeInteger(value) && value >= 0 ? ok(new Moves(value)) : err('invalid-moves');
  }

  // Delivers the value to a receiver of the border. No operation returns it.
  deliverTo(receiver: ValueReceiver<number>): void {
    receiver.receive(this.value);
  }

  equals(other: Moves): boolean {
    return this.value === other.value;
  }

  // Fewer moves is the better result (DS-4). An equal count is not fewer.
  isFewerThan(other: Moves): boolean {
    return this.value < other.value;
  }
}
