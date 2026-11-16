import type { BoundsReceiver } from './bounds-receiver.js';
import type { Ordered } from './ordered.js';

// A closed interval [min, max] over a value that orders itself, such as the
// Range<CharacterCount> of a credential length. The bounds are private and
// never change. contains() tells if a value lies inside the bounds, and
// isExceededBy() tells if it lies above them. Each answer asks the values
// with isAfter(), so the order lives in T and no number order crosses the
// range (#99). The bounds leave only through deliverBoundsTo().
export class Range<T extends Ordered<T>> {
  private constructor(
    private readonly min: T,
    private readonly max: T,
  ) {}

  // Throws RangeError when min comes after max. The code builds each range
  // from fixed bounds, so that is a defect of the code (decision 11).
  static of<T extends Ordered<T>>(min: T, max: T): Range<T> {
    if (min.isAfter(max)) {
      throw new RangeError('A Range needs min <= max.');
    }
    return new Range(min, max);
  }

  contains(value: T): boolean {
    return !this.min.isAfter(value) && !value.isAfter(this.max);
  }

  // Tells if a value lies above the upper bound.
  isExceededBy(value: T): boolean {
    return value.isAfter(this.max);
  }

  // Delivers both bounds to a receiver of the border, for the OpenAPI limits
  // and the messages of the HTTP adapter. No operation returns a bound.
  deliverBoundsTo(receiver: BoundsReceiver<T>): void {
    receiver.receive(this.min, this.max);
  }

  // Two ranges are equal when their bounds are equal values.
  equals(other: Range<T>): boolean {
    return this.min.equals(other.min) && this.max.equals(other.max);
  }
}
