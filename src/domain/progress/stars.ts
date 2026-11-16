import { err, ok, type Result } from '../shared/result.js';
import type { ValueReceiver } from '../shared/value-receiver.js';

// The code of the broken rule. The border writes the message (decision 11).
export type StarsProblem = 'invalid-stars';

// Value object for the stars that a player earns in one level. It is a non-negative
// safe integer.
export class Stars {
  private constructor(private readonly value: number) {}

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
