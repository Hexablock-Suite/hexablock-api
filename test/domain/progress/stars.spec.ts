import { Stars } from '../../../src/domain/progress/stars.js';
import { valueOf } from '../../support/result.js';

const stars = (value: number): Stars => valueOf(Stars.of(value));

// The stars that a player earns in one level. More stars is better (DS-4).
// The PlayerProgress spec pins that order through the root, so this spec
// keeps the rules that the root cannot reach.
describe('Stars', () => {
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
    expect(Stars.of(bad)).toEqual({ ok: false, error: 'invalid-stars' });
  });

  it.each(['3', undefined, null])(
    'should_give_the_code_of_the_rule_when_value_is_not_a_number',
    (bad) => {
      expect(Stars.of(bad as unknown as number)).toEqual({ ok: false, error: 'invalid-stars' });
    },
  );

  it('should_be_equal_when_two_values_hold_the_same_count', () => {
    const value = stars(3);
    const twin = stars(3);
    const other = stars(2);

    expect(twin).not.toBe(value);
    expect(value.equals(twin)).toBe(true);
    expect(twin.equals(value)).toBe(true);
    expect(value.equals(other)).toBe(false);
    expect(other.equals(value)).toBe(false);
    expect(stars(-0).equals(stars(0))).toBe(true);
  });
});

// A total of stars is a sum of stored rows, so of() keeps no column
// bound (#135).
describe('Stars.of', () => {
  it('should_build_a_total_over_the_column_when_of_builds_a_sum', () => {
    expect(Stars.of(4_294_967_294).ok).toBe(true);
  });
});
