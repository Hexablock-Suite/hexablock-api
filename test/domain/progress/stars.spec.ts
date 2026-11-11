import { Stars } from '../../../src/domain/progress/stars.js';
import { ProgressError } from '../../../src/domain/progress/progress-error.js';
import { RecordingReceiver } from '../../support/recording-receiver.js';

// The stars that a player earns in one level. More stars is better (DS-4).
describe('Stars', () => {
  it('should_reject_the_value_when_it_is_negative_or_not_a_safe_integer', () => {
    for (const bad of [
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      2 ** 53,
      -(2 ** 53),
    ]) {
      expect(() => Stars.of(bad)).toThrow(ProgressError);
    }
    expect(() => Stars.of(-1)).toThrow('stars must be a non-negative integer, got -1.');
    expect(() => Stars.of('3' as unknown as number)).toThrow(
      'stars must be a non-negative integer, got 3.',
    );
  });

  it('should_be_equal_when_two_values_hold_the_same_count', () => {
    const value = Stars.of(3);
    const twin = Stars.of(3);
    const other = Stars.of(2);

    expect(twin).not.toBe(value);
    expect(value.equals(twin)).toBe(true);
    expect(twin.equals(value)).toBe(true);
    expect(value.equals(other)).toBe(false);
    expect(other.equals(value)).toBe(false);
    expect(Stars.of(-0).equals(Stars.of(0))).toBe(true);
  });

  // An equal count is not more, so a tie goes on to the moves.
  it('should_tell_which_count_has_more_stars_when_two_counts_are_compared', () => {
    const better = Stars.of(3);
    const worse = Stars.of(2);

    expect(better.isMoreThan(worse)).toBe(true);
    expect(worse.isMoreThan(better)).toBe(false);
    expect(better.isMoreThan(Stars.of(3))).toBe(false);
  });

  // #90: the value leaves only through a delivery to a receiver.
  it('should_deliver_the_value_to_the_receiver_when_the_factory_took_it', () => {
    const receiver = new RecordingReceiver<number>();

    Stars.of(3).deliverTo(receiver);

    expect(receiver.received).toEqual([3]);
  });

  it('should_have_no_public_value_field_when_the_value_leaves_through_a_delivery', () => {
    const stars = Stars.of(3);
    const receiver = new RecordingReceiver<number>();

    // @ts-expect-error -- #90 makes the value private.
    void stars.value;
    // The delivery returns nothing: the receiver holds the value.
    expect(stars.deliverTo(receiver)).toBeUndefined();
  });
});
