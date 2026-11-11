import { ElapsedTime } from '../../../src/domain/progress/elapsed-time.js';
import { ProgressError } from '../../../src/domain/progress/progress-error.js';
import { RecordingReceiver } from '../../support/recording-receiver.js';

// The time that a player takes in one level, in whole milliseconds. Less time is better (DS-4).
describe('ElapsedTime', () => {
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
      expect(() => ElapsedTime.ofMs(bad)).toThrow(ProgressError);
    }
    expect(() => ElapsedTime.ofMs(-1)).toThrow('elapsedMs must be a non-negative integer, got -1.');
    expect(() => ElapsedTime.ofMs('3' as unknown as number)).toThrow(
      'elapsedMs must be a non-negative integer, got 3.',
    );
  });

  it('should_be_equal_when_two_values_hold_the_same_count', () => {
    const value = ElapsedTime.ofMs(44_999);
    const twin = ElapsedTime.ofMs(44_999);
    const other = ElapsedTime.ofMs(45_000);

    expect(twin).not.toBe(value);
    expect(value.equals(twin)).toBe(true);
    expect(twin.equals(value)).toBe(true);
    expect(value.equals(other)).toBe(false);
    expect(other.equals(value)).toBe(false);
    expect(ElapsedTime.ofMs(-0).equals(ElapsedTime.ofMs(0))).toBe(true);
  });

  // An equal time is not shorter, so a full tie keeps the stored result.
  it('should_tell_which_time_is_shorter_when_two_times_are_compared', () => {
    const better = ElapsedTime.ofMs(44_999);
    const worse = ElapsedTime.ofMs(45_000);

    expect(better.isShorterThan(worse)).toBe(true);
    expect(worse.isShorterThan(better)).toBe(false);
    expect(better.isShorterThan(ElapsedTime.ofMs(44_999))).toBe(false);
  });

  // #90: the value leaves only through a delivery to a receiver.
  it('should_deliver_the_value_to_the_receiver_when_the_factory_took_it', () => {
    const receiver = new RecordingReceiver<number>();

    ElapsedTime.ofMs(1500).deliverTo(receiver);

    expect(receiver.received).toEqual([1500]);
  });

  it('should_have_no_public_value_field_when_the_value_leaves_through_a_delivery', () => {
    const time = ElapsedTime.ofMs(1500);
    const receiver = new RecordingReceiver<number>();

    // @ts-expect-error -- #90 makes the value private.
    void time.value;
    // The delivery returns nothing: the receiver holds the value.
    expect(time.deliverTo(receiver)).toBeUndefined();
  });
});
