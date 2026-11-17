import { CharacterCount } from '../../../src/domain/user/character-count.js';
import { deliveredBy, RecordingReceiver } from '../../support/recording-receiver.js';
import { valueOf } from '../../support/result.js';

// One code point, two UTF-16 units.
const EMOJI = '\u{1F600}';

const count = (value: number): CharacterCount => valueOf(CharacterCount.of(value));

// #99: the count of the characters of a text. The credential limits are a
// Range<CharacterCount>, so no number order crosses the domain.
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

  // A character is one Unicode code point, not one UTF-16 unit (#60). A row
  // gives the text and its count.
  it.each([
    ['', 0],
    ['ada', 3],
    [EMOJI, 1],
    [EMOJI.repeat(128), 128],
    [`a${EMOJI}b`, 3],
  ])('should_count_each_code_point_once_when_the_count_is_taken_from_a_text', (text, value) => {
    const counted = CharacterCount.ofText(text);

    expect(counted).toBeInstanceOf(CharacterCount);
    expect(deliveredBy(counted)).toEqual([value]);
  });

  // #142: a limit of the code is a fixed count, such as a bound of
  // USERNAME_LENGTH. Username and Password build their limits here.
  it.each([0, 3, 128])('should_deliver_the_count_when_a_limit_is_a_valid_count', (value) => {
    const limit = CharacterCount.ofLimit(value, 'username');

    expect(limit).toBeInstanceOf(CharacterCount);
    expect(deliveredBy(limit)).toEqual([value]);
  });

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

  it('should_be_after_another_count_only_when_it_is_greater', () => {
    expect(count(9).isAfter(count(8))).toBe(true);
    expect(count(8).isAfter(count(9))).toBe(false);
    expect(count(8).isAfter(count(8))).toBe(false);
  });

  it('should_be_equal_when_two_counts_hold_the_same_number', () => {
    expect(count(8).equals(count(8))).toBe(true);
    expect(CharacterCount.ofText(EMOJI).equals(count(1))).toBe(true);
    expect(count(8).equals(count(9))).toBe(false);
  });

  // The count leaves only through a delivery to a receiver (decision 15).
  it('should_have_no_public_value_field_when_the_count_leaves_through_a_delivery', () => {
    const counted = count(32);
    const receiver = new RecordingReceiver<number>();

    // @ts-expect-error -- the value is private.
    void counted.value;
    // The delivery returns nothing: the receiver holds the count.
    expect(counted.deliverTo(receiver)).toBeUndefined();
    expect(receiver.received).toEqual([32]);
  });
});
