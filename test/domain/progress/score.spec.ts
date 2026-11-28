import { Score } from '../../../src/domain/progress/score.js';
import { valueOf } from '../../support/result.js';

const score = (value: number): Score => valueOf(Score.of(value));

describe('Score', () => {
  it.each([0, 1, 120, Number.MAX_SAFE_INTEGER])(
    'should_accept_the_score_when_value_is_a_non_negative_safe_integer',
    (value) => {
      expect(score(value).equals(score(value))).toBe(true);
    },
  );

  // One failure mechanism (decision 11): a failed Result with the code of
  // the rule, never an exception. The border writes the message.
  it.each([-1, 2.5, Number.NaN])(
    'should_give_the_code_of_the_rule_when_value_is_negative_or_not_an_integer',
    (value) => {
      expect(Score.of(value)).toEqual({ ok: false, error: 'invalid-score' });
    },
  );

  it.each([Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 2 ** 53, -(2 ** 53)])(
    'should_give_the_code_of_the_rule_when_value_is_infinite_or_an_unsafe_integer',
    (value) => {
      expect(Score.of(value)).toEqual({ ok: false, error: 'invalid-score' });
    },
  );

  it.each([undefined, null, '120', true, {}])(
    'should_give_the_code_of_the_rule_when_value_is_not_a_number',
    (value) => {
      expect(Score.of(value as unknown as number)).toEqual({ ok: false, error: 'invalid-score' });
    },
  );

  it('should_be_equal_when_two_scores_hold_the_same_value', () => {
    expect(score(120).equals(score(120))).toBe(true);
    expect(score(120).equals(score(121))).toBe(false);
  });

  // -0 is a non-negative integer: -0 < 0 is false. It counts as a zero score.
  it('should_be_a_zero_score_when_value_is_negative_zero', () => {
    expect(score(-0).equals(score(0))).toBe(true);
    expect(score(0).isHigherThan(score(-0))).toBe(false);
  });
});
