import { Moves } from '../../../src/domain/progress/moves.js';
import { RecordingReceiver } from '../../support/recording-receiver.js';
import { valueOf } from '../../support/result.js';

const moves = (value: number): Moves => valueOf(Moves.of(value));

// The moves that a player uses in one level. Fewer moves is better (DS-4).
// The LevelResult spec pins that order, so this spec keeps the creation rules.
describe('Moves', () => {
  // One failure mechanism (decision 11): a failed Result with the code of
  // the rule, never an exception. The border writes the message.
  it.each([
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    2 ** 53,
    -(2 ** 53),
  ])('should_give_the_code_of_the_rule_when_value_is_negative_or_not_a_safe_integer', (bad) => {
    expect(Moves.of(bad)).toEqual({ ok: false, error: 'invalid-moves' });
  });

  it.each(['3', undefined, null])(
    'should_give_the_code_of_the_rule_when_value_is_not_a_number',
    (bad) => {
      expect(Moves.of(bad as unknown as number)).toEqual({ ok: false, error: 'invalid-moves' });
    },
  );

  it('should_be_equal_when_two_values_hold_the_same_count', () => {
    const value = moves(12);
    const twin = moves(12);
    const other = moves(13);

    expect(twin).not.toBe(value);
    expect(value.equals(twin)).toBe(true);
    expect(twin.equals(value)).toBe(true);
    expect(value.equals(other)).toBe(false);
    expect(other.equals(value)).toBe(false);
    expect(moves(-0).equals(moves(0))).toBe(true);
  });

  // #90: the value leaves only through a delivery to a receiver.
  it('should_deliver_the_value_to_the_receiver_when_the_factory_took_it', () => {
    const receiver = new RecordingReceiver<number>();

    moves(12).deliverTo(receiver);

    expect(receiver.received).toEqual([12]);
  });

  it('should_have_no_public_value_field_when_the_value_leaves_through_a_delivery', () => {
    const built = moves(12);
    const receiver = new RecordingReceiver<number>();

    // @ts-expect-error -- #90 makes the value private.
    void built.value;
    // The delivery returns nothing: the receiver holds the value.
    expect(built.deliverTo(receiver)).toBeUndefined();
  });
});
