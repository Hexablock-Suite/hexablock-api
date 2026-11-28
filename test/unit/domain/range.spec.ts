import type { Ordered } from '../../../src/domain/shared/ordered.js';
import { Range } from '../../../src/domain/shared/range.js';
import { CharacterCount } from '../../../src/domain/shared/character-count.js';
import { boundsDeliveredBy, deliveredBy } from '../../support/recording-receiver.js';
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

// #99: the value orders itself, so the range asks it with booleans and no
// number order crosses the range.
//
// #255: RegisterUseCase holds contains() at each limit of a credential, and
// LoginUseCase holds isExceededBy() at the maximum of a password. The cases
// below stay, because no root and no use case reaches their rule: the code
// builds each range from fixed bounds, every range of src/ is a range of
// counts, only the border receives the bounds, and no code of src/ calls
// equals().
describe('Range', () => {
  it('should_throw_range_error_when_min_comes_after_max', () => {
    expect(() => counts(5, 4)).toThrow(new RangeError('A Range needs min <= max.'));
  });

  // #90: the bounds leave only through a delivery to a receiver. The OpenAPI
  // limits and the messages of the border receive them.
  it('should_deliver_both_bounds_to_the_receiver_when_range_is_created', () => {
    const delivered = boundsDeliveredBy(counts(8, 128));

    expect(delivered).toHaveLength(1);
    expect(delivered[0].flatMap((bound) => deliveredBy(bound))).toEqual([8, 128]);
  });

  // The order lives in the value, so a range of any value that orders itself works.
  it('should_ask_the_value_for_its_order_when_the_bounds_are_another_ordered_type', () => {
    const range = Range.of(Day.of(1), Day.of(30));

    expect(range.contains(Day.of(6))).toBe(true);
    expect(range.contains(Day.of(31))).toBe(false);
    expect(range.isExceededBy(Day.of(31))).toBe(true);
    expect(() => Range.of(Day.of(30), Day.of(1))).toThrow(RangeError);
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
