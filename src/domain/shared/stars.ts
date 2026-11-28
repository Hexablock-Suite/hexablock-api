import { err, ok, type Result } from './result.js';
import type { ValueReceiver } from './value-receiver.js';

// The code of the broken rule. The border writes the message (decision 11).
export type StarsProblem = 'invalid-stars';

// Value object for the stars that a player earns in one level, or for a
// total of stars. It is a non-negative safe integer.
export class Stars {
  private constructor(private readonly value: number) {}

  // Builds the stars of a value that the API already holds: a stored result,
  // or a total that sums the stored results. A total can exceed the bound of
  // one play, and a stored value keeps what it holds, so this factory has no
  // upper bound. The bound of the stars that a client sends lives at the
  // border (#135, #179).
  static of(value: number): Result<Stars, StarsProblem> {
    return Number.isSafeInteger(value) && value >= 0 ? ok(new Stars(value)) : err('invalid-stars');
  }

  // Delivers the value to a receiver of the border. No operation returns it.
  deliverTo(receiver: ValueReceiver<number>): void {
    receiver.receive(this.value);
  }

  equals(other: Stars): boolean {
    return this.value === other.value;
  }

  // More stars is the better result (DS-4). An equal count is not more.
  isMoreThan(other: Stars): boolean {
    return this.value > other.value;
  }
}
