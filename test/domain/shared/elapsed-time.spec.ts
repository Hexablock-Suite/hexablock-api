import { ElapsedTime } from '../../../src/domain/shared/elapsed-time.js';
import { valueOf } from '../../support/result.js';

const elapsedTime = (value: number): ElapsedTime => valueOf(ElapsedTime.ofMs(value));

// The time that a player takes in one level, in whole milliseconds. Less time is better (DS-4).
// The PlayerProgress spec pins that order through the root, so this spec
// keeps the rules that the root cannot reach.
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
});
