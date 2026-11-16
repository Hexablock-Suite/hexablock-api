import { LevelsCompleted } from '../../../src/domain/progress/levels-completed.js';
import type { Result } from '../../../src/domain/shared/result.js';
import { deliveredBy } from '../../support/recording-receiver.js';

function created<T>(result: Result<T, string>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

const count = (value: number): LevelsCompleted => created(LevelsCompleted.of(value));

// S3-03: the count of levels of one game that a player completed.
describe('LevelsCompleted', () => {
  it('should_accept_the_count_when_value_is_a_non_negative_safe_integer', () => {
    expect(deliveredBy(count(0))).toEqual([0]);
    expect(deliveredBy(count(1))).toEqual([1]);
    expect(deliveredBy(count(12))).toEqual([12]);
    expect(deliveredBy(count(Number.MAX_SAFE_INTEGER))).toEqual([Number.MAX_SAFE_INTEGER]);
  });

  // One failure mechanism: a failed Result with the code of the rule, never an exception.
  it('should_give_the_code_of_the_rule_when_value_is_negative_fractional_or_unsafe', () => {
    const failure = { ok: false, error: 'invalid-levels-completed' };

    expect(LevelsCompleted.of(-1)).toEqual(failure);
    expect(LevelsCompleted.of(1.5)).toEqual(failure);
    expect(LevelsCompleted.of(Number.NaN)).toEqual(failure);
    expect(LevelsCompleted.of(Number.POSITIVE_INFINITY)).toEqual(failure);
    expect(LevelsCompleted.of(2 ** 53)).toEqual(failure);
  });

  it('should_give_the_code_of_the_rule_when_value_is_not_a_number', () => {
    expect(LevelsCompleted.of('3' as unknown as number)).toEqual({
      ok: false,
      error: 'invalid-levels-completed',
    });
    expect(LevelsCompleted.of(undefined as unknown as number)).toEqual({
      ok: false,
      error: 'invalid-levels-completed',
    });
  });

  it('should_be_more_only_when_its_count_is_greater_than_the_other', () => {
    expect(count(3).isMoreThan(count(2))).toBe(true);
    expect(count(2).isMoreThan(count(2))).toBe(false);
    expect(count(1).isMoreThan(count(2))).toBe(false);
  });

  it('should_tell_that_no_level_is_completed_only_when_the_count_is_zero', () => {
    expect(count(0).isNone()).toBe(true);
    expect(count(1).isNone()).toBe(false);
  });

  it('should_be_equal_when_two_counts_hold_the_same_value', () => {
    expect(count(2).equals(count(2))).toBe(true);
    expect(count(2).equals(count(3))).toBe(false);
  });
});
