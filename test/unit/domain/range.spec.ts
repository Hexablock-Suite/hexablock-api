import type { Ordered } from '../../../src/domain/shared/ordered.js';
import { Range } from '../../../src/domain/shared/range.js';
import { CharacterCount } from '../../../src/domain/user/character-count.js';
import {
  boundsDeliveredBy,
  deliveredBy,
  RecordingBoundsReceiver,
} from '../../support/recording-receiver.js';
import { valueOf } from '../../support/result.js';

const count = (value: number): CharacterCount => valueOf(CharacterCount.of(value));
const counts = (min: number, max: number): Range<CharacterCount> =>
  Range.of(count(min), count(max));

// A test value that orders itself: a day of one month.
class Day implements Ordered<Day> {
  private constructor(private readonly number: number) {}

  static of(number: number): Day {
    return new Day(number);
  }

  isAfter(other: Day): boolean {
    return this.number > other.number;
  }

  equals(other: Day): boolean {
    return this.number === other.number;
  }
}

// The values of the two bounds that a range of counts delivers.
const boundValuesOf = (range: Range<CharacterCount>): number[] =>
  boundsDeliveredBy(range).flatMap(([min, max]) => [...deliveredBy(min), ...deliveredBy(max)]);

// #99: the value orders itself, so the range asks it with booleans and no
// number order crosses the range.
describe('Range', () => {
  it('should_contain_value_when_it_lies_between_the_bounds_inclusive', () => {
    const range = counts(3, 32);

    expect([3, 4, 31, 32].map((value) => range.contains(count(value)))).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  it.each([0, 2, 33, Number.MAX_SAFE_INTEGER])(
    'should_not_contain_value_when_it_lies_outside_the_bounds',
    (value) => {
      expect(counts(3, 32).contains(count(value))).toBe(false);
    },
  );

  it('should_contain_only_the_bound_when_min_equals_max', () => {
    const range = counts(5, 5);

    expect([4, 5, 6].map((value) => range.contains(count(value)))).toEqual([false, true, false]);
  });

  // PasswordAttempt.isLongerThanAnyPassword() asks this, so it reads no
  // bound. A row gives the value and the answer.
  it.each([
    [129, true],
    [Number.MAX_SAFE_INTEGER, true],
    [128, false],
    [8, false],
    [7, false],
    [0, false],
  ])('should_be_exceeded_only_when_value_is_above_the_upper_bound', (value, exceeded) => {
    expect(counts(8, 128).isExceededBy(count(value))).toBe(exceeded);
  });

  it('should_throw_range_error_when_min_comes_after_max', () => {
    expect(() => counts(5, 4)).toThrow(new RangeError('A Range needs min <= max.'));
  });

  // #90: the bounds leave only through a delivery to a receiver.
  it('should_deliver_both_bounds_to_the_receiver_when_range_is_created', () => {
    const range = counts(8, 128);
    const delivered = boundsDeliveredBy(range);

    expect(delivered).toHaveLength(1);
    expect(delivered[0][0].equals(count(8))).toBe(true);
    expect(delivered[0][1].equals(count(128))).toBe(true);
    expect(boundValuesOf(range)).toEqual([8, 128]);
  });

  it('should_have_no_public_bound_field_when_the_bounds_leave_through_a_delivery', () => {
    const range = counts(8, 128);

    // @ts-expect-error -- #90 makes the lower bound private.
    void range.min;
    // @ts-expect-error -- #90 makes the upper bound private.
    void range.max;
    // The delivery returns nothing: the receiver holds the bounds.
    expect(range.deliverBoundsTo(new RecordingBoundsReceiver<CharacterCount>())).toBeUndefined();
  });

  // The order lives in the value, so a range of any value that orders itself works.
  it('should_ask_the_value_for_its_order_when_the_bounds_are_another_ordered_type', () => {
    const range = Range.of(Day.of(1), Day.of(30));

    expect(range.contains(Day.of(6))).toBe(true);
    expect(range.contains(Day.of(31))).toBe(false);
    expect(range.isExceededBy(Day.of(31))).toBe(true);
    expect(() => Range.of(Day.of(30), Day.of(1))).toThrow(RangeError);
  });

  // #99: no number order crosses the factory. A range takes only its two bounds.
  it('should_take_only_the_two_bounds_when_the_factory_builds_a_range', () => {
    // @ts-expect-error -- #99: the factory takes no order function. The order lives in T.
    const range = Range.of(count(1), count(2), () => 0);

    expect(range.contains(count(2))).toBe(true);
    expect(range.contains(count(3))).toBe(false);
    expect('ofNumbers' in Range).toBe(false);
  });
});

describe('Range equals', () => {
  it('should_be_equal_when_two_ranges_have_equal_bounds', () => {
    const range = counts(1, 5);
    const twin = counts(1, 5);

    expect(twin).not.toBe(range);
    expect(range.equals(twin)).toBe(true);
    expect(twin.equals(range)).toBe(true);
  });

  it.each([
    [2, 5],
    [1, 6],
  ])('should_not_be_equal_when_one_bound_of_the_two_ranges_differs', (min, max) => {
    const range = counts(1, 5);
    const other = counts(min, max);

    expect(range.equals(other)).toBe(false);
    expect(other.equals(range)).toBe(false);
  });
});
