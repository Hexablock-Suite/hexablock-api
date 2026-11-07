// Orders two values as Array.prototype.sort does: a negative number, zero or
// a positive number. NaN means that the two values have no order.
export type Compare<T> = (left: T, right: T) => number;

// A closed interval [min, max] over any ordered type. The professor modeled
// the limits of the statement as a generic range with a contains method in
// the session of 2026-11-06.
export class Range<T> {
  private constructor(
    readonly min: T,
    readonly max: T,
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
}

// Subtraction gives NaN for two equal infinities, so this function compares.
function compareNumbers(left: number, right: number): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return left === right ? 0 : Number.NaN;
}
