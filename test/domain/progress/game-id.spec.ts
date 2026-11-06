import { GameId } from '../../../src/domain/progress/game-id.js';
import { ProgressError } from '../../../src/domain/progress/progress-error.js';

describe('GameId', () => {
  it('should_accept_each_variant_when_value_names_lines_fit_sort_or_merge', () => {
    const values = ['lines', 'fit', 'sort', 'merge'].map((value) => GameId.of(value).value);

    expect(values).toEqual(['lines', 'fit', 'sort', 'merge']);
  });

  // GameId is an open value (classes.md decision 5): a new variant needs no code change.
  it('should_accept_a_new_variant_when_value_is_a_lowercase_slug', () => {
    expect(GameId.of('tri-fit2').value).toBe('tri-fit2');
  });

  it('should_reject_game_id_when_value_is_missing_empty_or_not_a_slug', () => {
    for (const value of [undefined, null, '', '  ', 'Lines', 'fit sort', '-fit', 7]) {
      expect(() => GameId.of(value as unknown as string)).toThrow(ProgressError);
    }
  });

  it('should_be_equal_when_two_game_ids_hold_the_same_value', () => {
    expect(GameId.of('fit').equals(GameId.of('fit'))).toBe(true);
    expect(GameId.of('fit').equals(GameId.of('sort'))).toBe(false);
  });
});
