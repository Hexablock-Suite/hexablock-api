import { Moves } from '../../../src/domain/progress/moves.js';
import { ProgressError } from '../../../src/domain/progress/progress-error.js';
import { RecordingReceiver } from '../../support/recording-receiver.js';

// The moves that a player uses in one level. Fewer moves is better (DS-4).
// The LevelResult spec pins that order, so this spec keeps the creation rules.
describe('Moves', () => {
  it.each([
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    2 ** 53,
    -(2 ** 53),
  ])('should_reject_the_value_when_it_is_negative_or_not_a_safe_integer', (bad) => {
    expect(() => Moves.of(bad)).toThrow(ProgressError);
  });

  it('should_name_the_field_and_the_value_when_the_value_is_rejected', () => {
    expect(() => Moves.of(-1)).toThrow('moves must be a non-negative integer, got -1.');
    expect(() => Moves.of('3' as unknown as number)).toThrow(
      'moves must be a non-negative integer, got 3.',
    );
  });

  it('should_be_equal_when_two_values_hold_the_same_count', () => {
    const value = Moves.of(12);
    const twin = Moves.of(12);
    const other = Moves.of(13);

    expect(twin).not.toBe(value);
    expect(value.equals(twin)).toBe(true);
    expect(twin.equals(value)).toBe(true);
    expect(value.equals(other)).toBe(false);
    expect(other.equals(value)).toBe(false);
    expect(Moves.of(-0).equals(Moves.of(0))).toBe(true);
  });

  // #90: the value leaves only through a delivery to a receiver.
  it('should_deliver_the_value_to_the_receiver_when_the_factory_took_it', () => {
    const receiver = new RecordingReceiver<number>();

    Moves.of(12).deliverTo(receiver);

    expect(receiver.received).toEqual([12]);
  });

  it('should_have_no_public_value_field_when_the_value_leaves_through_a_delivery', () => {
    const moves = Moves.of(12);
    const receiver = new RecordingReceiver<number>();

    // @ts-expect-error -- #90 makes the value private.
    void moves.value;
    // The delivery returns nothing: the receiver holds the value.
    expect(moves.deliverTo(receiver)).toBeUndefined();
  });
});
