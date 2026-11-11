import type { ValueReceiver } from '../shared/value-receiver.js';
import { ProgressError } from './progress-error.js';

// Value object for the stars that a player earns in one level. It is a non-negative
// safe integer.
export class Stars {
  private constructor(private readonly value: number) {}

  static of(value: number): Stars {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new ProgressError(`stars must be a non-negative integer, got ${value}.`);
    }
    return new Stars(value);
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
