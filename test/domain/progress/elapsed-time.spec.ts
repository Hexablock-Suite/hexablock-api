import { ElapsedTime } from '../../../src/domain/progress/elapsed-time.js';
import { RecordingReceiver } from '../../support/recording-receiver.js';
import { valueOf } from '../../support/result.js';

const elapsedTime = (value: number): ElapsedTime => valueOf(ElapsedTime.ofMs(value));

// The time that a player takes in one level, in whole milliseconds. Less time is better (DS-4).
// The LevelResult spec pins that order, so this spec keeps the creation rules.
describe('ElapsedTime', () => {
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
    expect(ElapsedTime.ofMs(bad)).toEqual({ ok: false, error: 'invalid-elapsed-time' });
  });

  it.each(['3', undefined, null])(
    'should_give_the_code_of_the_rule_when_value_is_not_a_number',
    (bad) => {
      expect(ElapsedTime.ofMs(bad as unknown as number)).toEqual({
        ok: false,
        error: 'invalid-elapsed-time',
      });
    },
  );

  it('should_be_equal_when_two_values_hold_the_same_count', () => {
    const value = elapsedTime(44_999);
    const twin = elapsedTime(44_999);
    const other = elapsedTime(45_000);

    expect(twin).not.toBe(value);
    expect(value.equals(twin)).toBe(true);
    expect(twin.equals(value)).toBe(true);
    expect(value.equals(other)).toBe(false);
    expect(other.equals(value)).toBe(false);
    expect(elapsedTime(-0).equals(elapsedTime(0))).toBe(true);
  });

  // #90: the value leaves only through a delivery to a receiver.
  it('should_deliver_the_value_to_the_receiver_when_the_factory_took_it', () => {
    const receiver = new RecordingReceiver<number>();

    elapsedTime(1500).deliverTo(receiver);

    expect(receiver.received).toEqual([1500]);
  });

  it('should_have_no_public_value_field_when_the_value_leaves_through_a_delivery', () => {
    const time = elapsedTime(1500);
    const receiver = new RecordingReceiver<number>();

    // @ts-expect-error -- #90 makes the value private.
    void time.value;
    // The delivery returns nothing: the receiver holds the value.
    expect(time.deliverTo(receiver)).toBeUndefined();
  });
});
