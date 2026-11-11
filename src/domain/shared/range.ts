import type { BoundsReceiver } from './bounds-receiver.js';

// Orders two values as Array.prototype.sort does: a negative number, zero or
// a positive number. NaN means that the two values have no order.
export type Compare<T> = (left: T, right: T) => number;

// A closed interval [min, max] over any ordered type. The bounds are
// private and never change. contains() tells if a value lies inside the
// bounds, and isExceededBy() tells if it lies above them. The bounds leave
// only through deliverBoundsTo().
export class Range<T> {
  private constructor(
    private readonly min: T,
    private readonly max: T,
    private readonly compare: Compare<T>,
  ) {}

  // Throws RangeError when min comes after max or the bounds have no order.
  static of<T>(min: T, max: T, compare: Compare<T>): Range<T> {
    if (!(compare(min, max) <= 0)) {
      throw new RangeError('A Range needs min <= max.');
    }
    return new Range(min, max, compare);
  }

  static ofNumbers(min: number, max: number): Range<number> {
    return Range.of(min, max, compareNumbers);
  }

  // A value without an order, such as NaN, is never inside the range.
  contains(value: T): boolean {
    return this.compare(this.min, value) <= 0 && this.compare(value, this.max) <= 0;
  }

  // Tells if a value lies above the upper bound. A value without an order,
  // such as NaN, is not above the range.
  isExceededBy(value: T): boolean {
    return this.compare(value, this.max) > 0;
  }

  // Delivers both bounds to a receiver of the border, for the OpenAPI limits
  // and the messages of the HTTP adapter. No operation returns a bound.
  deliverBoundsTo(receiver: BoundsReceiver<T>): void {
    receiver.receive(this.min, this.max);
  }

  // Two ranges are equal when each one reads the bounds of both as the same bounds.
  // The order of the range compares the bounds, so T needs no equals().
  // Each range asks its own order, so the answer is the same in both directions.
  equals(other: Range<T>): boolean {
    return this.hasBoundsOf(other) && other.hasBoundsOf(this);
  }

  private hasBoundsOf(other: Range<T>): boolean {
    return this.compare(this.min, other.min) === 0 && this.compare(this.max, other.max) === 0;
  }
}

// Subtraction gives NaN for two equal infinities, so this function compares.
function compareNumbers(left: number, right: number): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return left === right ? 0 : Number.NaN;
}
