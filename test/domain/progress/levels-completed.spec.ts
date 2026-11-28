import { LevelsCompleted } from '../../../src/domain/progress/levels-completed.js';
import type { Result } from '../../../src/domain/shared/result.js';
import { deliveredBy } from '../../support/recording-receiver.js';

function created<T>(result: Result<T, string>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

const count = (value: number): LevelsCompleted => created(LevelsCompleted.of(value));

// S3-03: the count of levels of one game that a player completed. The
// GetGlobalLeaderboard spec pins the order of two counts through the use
// case (#255), and the Standing spec pins a count of zero through the
// factory of Standing. A use case takes each count built, so the rules of
// the factory stay here.
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
});
