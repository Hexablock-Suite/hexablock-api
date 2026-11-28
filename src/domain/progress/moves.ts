import { err, ok, type Result } from '../shared/result.js';
import type { ValueReceiver } from '../shared/value-receiver.js';

// The code of the broken rule. The border writes the message (decision 11).
export type MovesProblem = 'invalid-moves';

// Value object for the moves that a player uses in one level, for a total of
// moves, or for the move limit of a star threshold. It is a non-negative
// safe integer.
export class Moves {
  private constructor(private readonly value: number) {}

  // Builds the moves of a value that the API already holds or reads from a
  // level: a stored result, a total that sums the stored results, or a star
  // threshold. A total can exceed the bound of one play, and a stored value
  // keeps what it holds, so this factory has no upper bound. The bound of
  // the moves that a client sends lives at the border (#135, #179).
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
