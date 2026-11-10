import { Range } from '../../../src/domain/shared/range.js';

describe('Range', () => {
  it('should_contain_value_when_it_lies_between_the_bounds_inclusive', () => {
    const range = Range.ofNumbers(3, 32);

    expect([3, 4, 31, 32].map((value) => range.contains(value))).toEqual([true, true, true, true]);
  });

  it('should_not_contain_value_when_it_lies_outside_the_bounds_or_is_not_a_number', () => {
    const range = Range.ofNumbers(3, 32);

    for (const value of [2, 33, -Infinity, Infinity, Number.NaN]) {
      expect(range.contains(value)).toBe(false);
    }
  });

  it('should_contain_infinite_value_when_upper_bound_is_infinite', () => {
    const range = Range.ofNumbers(0, Infinity);

    expect(range.contains(Infinity)).toBe(true);
    expect(range.contains(-1)).toBe(false);
  });

  it('should_expose_bounds_when_range_is_created', () => {
    const range = Range.ofNumbers(8, 128);

    expect(range.min).toBe(8);
    expect(range.max).toBe(128);
  });

  it('should_contain_only_the_bound_when_min_equals_max', () => {
    const range = Range.ofNumbers(5, 5);

    expect([4, 5, 6].map((value) => range.contains(value))).toEqual([false, true, false]);
  });

  it('should_throw_range_error_when_min_is_greater_than_max_or_a_bound_is_not_a_number', () => {
    for (const [min, max] of [
      [5, 4],
      [Number.NaN, 4],
      [1, Number.NaN],
    ]) {
      expect(() => Range.ofNumbers(min, max)).toThrow(new RangeError('A Range needs min <= max.'));
    }
  });

  it('should_order_values_with_the_compare_function_when_bounds_are_not_numbers', () => {
    const byTime = (left: Date, right: Date) => left.getTime() - right.getTime();
    const range = Range.of(new Date('2026-11-01'), new Date('2026-11-30'), byTime);

    expect(range.contains(new Date('2026-11-06'))).toBe(true);
    expect(range.contains(new Date('2026-12-01'))).toBe(false);
    expect(() => Range.of(new Date('2026-11-30'), new Date('2026-11-01'), byTime)).toThrow(
      RangeError,
    );
  });
});

describe('Range equals', () => {
  it('should_be_equal_when_two_ranges_have_bounds_of_the_same_order', () => {
    type Bound = { readonly n: number };
    const byN = (left: Bound, right: Bound): number => left.n - right.n;
    const range = Range.ofNumbers(1, 5);
    const twin = Range.ofNumbers(1, 5);

    expect(twin).not.toBe(range);
    expect(range.equals(twin)).toBe(true);
    expect(twin.equals(range)).toBe(true);
    for (const other of [Range.ofNumbers(2, 5), Range.ofNumbers(1, 6)]) {
      expect(range.equals(other)).toBe(false);
      expect(other.equals(range)).toBe(false);
    }
    expect(Range.of({ n: 1 }, { n: 5 }, byN).equals(Range.of({ n: 1 }, { n: 5 }, byN))).toBe(true);
  });

  it('should_give_one_answer_in_both_directions_when_two_ranges_use_different_orders', () => {
    const exact = (left: string, right: string): number => {
      if (left === right) return 0;
      return left < right ? -1 : 1;
    };
    const anyCase = (left: string, right: string): number =>
      exact(left.toLowerCase(), right.toLowerCase());
    const lower = Range.of<string>('a', 'z', exact);
    const upper = Range.of<string>('A', 'Z', anyCase);

    expect(lower.equals(upper)).toBe(false);
    expect(upper.equals(lower)).toBe(false);
  });
});
