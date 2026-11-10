import { ProgressError } from '../../../src/domain/progress/progress-error.js';
import { Score } from '../../../src/domain/progress/score.js';

describe('Score', () => {
  it('should_accept_the_score_when_value_is_a_non_negative_safe_integer', () => {
    for (const value of [0, 1, 120, Number.MAX_SAFE_INTEGER]) {
      expect(Score.of(value).equals(Score.of(value))).toBe(true);
    }
  });

  it('should_reject_the_score_when_value_is_negative_or_not_an_integer', () => {
    for (const value of [-1, 2.5, Number.NaN]) {
      expect(() => Score.of(value)).toThrow(ProgressError);
    }
    expect(() => Score.of(-1)).toThrow('score must be a non-negative integer, got -1.');
  });

  it('should_reject_the_score_when_value_is_infinite_or_an_unsafe_integer', () => {
    for (const value of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 2 ** 53, -(2 ** 53)]) {
      expect(() => Score.of(value)).toThrow(ProgressError);
    }
    expect(() => Score.of(2 ** 53)).toThrow(
      'score must be a non-negative integer, got 9007199254740992.',
    );
  });

  it('should_reject_the_score_when_value_is_not_a_number', () => {
    for (const value of [undefined, null, '120', true, {}]) {
      expect(() => Score.of(value as unknown as number)).toThrow(ProgressError);
    }
  });

  it('should_be_equal_when_two_scores_hold_the_same_value', () => {
    expect(Score.of(120).equals(Score.of(120))).toBe(true);
    expect(Score.of(120).equals(Score.of(121))).toBe(false);
  });

  // -0 is a non-negative integer: -0 < 0 is false. It counts as a zero score.
  it('should_be_a_zero_score_when_value_is_negative_zero', () => {
    expect(Score.of(-0).equals(Score.of(0))).toBe(true);
    expect(Score.of(0).isHigherThan(Score.of(-0))).toBe(false);
  });

  it('should_be_higher_only_when_its_value_is_greater_than_the_other', () => {
    expect(Score.of(121).isHigherThan(Score.of(120))).toBe(true);
    expect(Score.of(120).isHigherThan(Score.of(120))).toBe(false);
    expect(Score.of(80).isHigherThan(Score.of(120))).toBe(false);
  });
});
