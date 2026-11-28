import { CharacterCount } from '../../../src/domain/user/character-count.js';
import { deliveredBy } from '../../support/recording-receiver.js';
import { valueOf } from '../../support/result.js';

const count = (value: number): CharacterCount => valueOf(CharacterCount.of(value));

// #99: the count of the characters of a text. The credential limits are a
// Range<CharacterCount>, so no number order crosses the domain.
//
// #255: RegisterUseCase and LoginUseCase hold the count of a text in code
// points and the order of two counts, at each limit of a credential. The
// cases below stay, because no root and no use case reaches their rule: no
// code builds a count from a raw number except the limits, which are
// constants of the code, and only Range.equals() asks equals().
describe('CharacterCount', () => {
  it.each([0, 3, 128, Number.MAX_SAFE_INTEGER])(
    'should_deliver_the_count_when_it_is_a_non_negative_safe_integer',
    (value) => {
      expect(deliveredBy(count(value))).toEqual([value]);
    },
  );

  // One failure mechanism (decision 11): a failed Result with the code of
  // the rule, never an exception.
  it.each([-1, 1.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'should_give_the_code_of_the_rule_when_the_count_is_not_a_non_negative_safe_integer',
    (value) => {
      expect(CharacterCount.of(value)).toEqual({ ok: false, error: 'invalid-character-count' });
    },
  );

  // A limit that breaks the rule is a defect of the code (decision 11), so
  // the factory throws. The message names the owner of the limit.
  it.each([
    [-1, 'username'],
    [1.5, 'password'],
  ])(
    'should_throw_a_range_error_that_names_the_owner_when_a_limit_breaks_the_rule',
    (value, owner) => {
      const build = () => CharacterCount.ofLimit(value, owner);

      expect(build).toThrow(RangeError);
      expect(build).toThrow(`A ${owner} limit breaks the rule invalid-character-count.`);
    },
  );

  it('should_be_equal_when_two_counts_hold_the_same_number', () => {
    // One code point, two UTF-16 units.
    expect(count(8).equals(count(8))).toBe(true);
    expect(CharacterCount.ofText('\u{1F600}').equals(count(1))).toBe(true);
    expect(count(8).equals(count(9))).toBe(false);
  });
});
