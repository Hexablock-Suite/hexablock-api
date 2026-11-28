import { LevelId } from '../../../src/domain/progress/level-id.js';

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
