import { LevelId } from '../../../src/domain/progress/level-id.js';
import { RecordingReceiver } from '../../support/recording-receiver.js';
import { valueOf } from '../../support/result.js';

const levelId = (value: string): LevelId => valueOf(LevelId.of(value));

// The id of one level of a game, such as fit-01.
describe('LevelId', () => {
  // One failure mechanism (decision 11): a failed Result with the code of
  // the rule, never an exception. The border writes the message. Each row is
  // an array of one value, so the array case reaches the factory whole.
  it.each([[undefined], [null], [''], ['  '], [5], [['fit-01']]])(
    'should_give_the_code_of_the_rule_when_the_id_is_blank_or_not_a_string',
    (bad) => {
      expect(LevelId.of(bad as unknown as string)).toEqual({
        ok: false,
        error: 'invalid-level-id',
      });
    },
  );

  // The id is kept as it arrives: letter case and spaces count.
  it('should_be_equal_when_two_ids_hold_the_same_text', () => {
    const id = levelId('fit-01');
    const twin = levelId('fit-01');

    expect(twin).not.toBe(id);
    expect(id.equals(twin)).toBe(true);
    expect(twin.equals(id)).toBe(true);
  });

  it.each(['fit-02', 'FIT-01', ' fit-01'])(
    'should_not_be_equal_when_the_text_differs_in_a_letter_its_case_or_a_space',
    (other) => {
      const id = levelId('fit-01');

      expect(id.equals(levelId(other))).toBe(false);
      expect(levelId(other).equals(id)).toBe(false);
    },
  );

  // #90: the value leaves only through a delivery to a receiver.
  it('should_deliver_the_value_to_the_receiver_when_the_factory_took_it', () => {
    const receiver = new RecordingReceiver<string>();

    levelId('fit-01').deliverTo(receiver);

    expect(receiver.received).toEqual(['fit-01']);
  });

  it('should_have_no_public_value_field_when_the_value_leaves_through_a_delivery', () => {
    const built = levelId('fit-01');
    const receiver = new RecordingReceiver<string>();

    // @ts-expect-error -- #90 makes the value private.
    void built.value;
    // The delivery returns nothing: the receiver holds the value.
    expect(built.deliverTo(receiver)).toBeUndefined();
  });
});

// A stored row keeps what it holds, so of() keeps neither rule (#135).
describe('LevelId.of', () => {
  it.each(['f'.repeat(10_000), 'fit\n01'])(
    'should_build_a_stored_level_id_over_the_bounds_when_of_rebuilds_a_row',
    (value) => {
      expect(LevelId.of(value).ok).toBe(true);
    },
  );
});
