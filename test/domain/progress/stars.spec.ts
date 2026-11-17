import { Stars } from '../../../src/domain/progress/stars.js';
import { RecordingReceiver } from '../../support/recording-receiver.js';
import { valueOf } from '../../support/result.js';

const stars = (value: number): Stars => valueOf(Stars.of(value));

// The stars that a player earns in one level. More stars is better (DS-4).
// The LevelResult spec pins that order, so this spec keeps the creation rules.
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

  // #90: the value leaves only through a delivery to a receiver.
  it('should_deliver_the_value_to_the_receiver_when_the_factory_took_it', () => {
    const receiver = new RecordingReceiver<number>();

    stars(3).deliverTo(receiver);

    expect(receiver.received).toEqual([3]);
  });

  it('should_have_no_public_value_field_when_the_value_leaves_through_a_delivery', () => {
    const built = stars(3);
    const receiver = new RecordingReceiver<number>();

    // @ts-expect-error -- #90 makes the value private.
    void built.value;
    // The delivery returns nothing: the receiver holds the value.
    expect(built.deliverTo(receiver)).toBeUndefined();
  });
});

// #135: the stars of one play that a client sends must fit the integer
// column of level_results. A total of stars is a sum, and a stored row keeps
// what it holds, so of() keeps no such bound.
describe('Stars.ofIncoming', () => {
  it.each([2_147_483_648, 3_000_000_000, -1, 1.5])(
    'should_give_the_code_of_the_rule_when_the_stars_of_a_play_exceed_the_column_or_break_the_rule',
    (bad) => {
      expect(Stars.ofIncoming(bad)).toEqual({ ok: false, error: 'invalid-stars' });
    },
  );

  it.each([0, 3, 2_147_483_647])(
    'should_build_the_stars_when_the_stars_of_a_play_fit_the_column',
    (value) => {
      expect(valueOf(Stars.ofIncoming(value)).equals(stars(value))).toBe(true);
    },
  );

  it('should_build_a_total_over_the_column_when_of_builds_a_sum', () => {
    expect(Stars.of(4_294_967_294).ok).toBe(true);
  });
});
