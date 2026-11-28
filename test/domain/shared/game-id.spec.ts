import { GameId } from '../../../src/domain/shared/game-id.js';
import { RecordingReceiver } from '../../support/recording-receiver.js';
import { valueOf } from '../../support/result.js';

const gameId = (value: string): GameId => valueOf(GameId.of(value));

describe('GameId', () => {
  it.each(['lines', 'fit', 'sort', 'merge'])(
    'should_accept_each_variant_when_value_names_lines_fit_sort_or_merge',
    (value) => {
      const receiver = new RecordingReceiver<string>();

      gameId(value).deliverTo(receiver);

      expect(receiver.received).toEqual([value]);
    },
  );

  // GameId is an open value (classes.md decision 5): a new variant needs no code change.
  it('should_accept_a_new_variant_when_value_is_a_lowercase_slug', () => {
    const receiver = new RecordingReceiver<string>();

    gameId('tri-fit2').deliverTo(receiver);

    expect(receiver.received).toEqual(['tri-fit2']);
  });

  // One failure mechanism (decision 11): a failed Result with the code of
  // the rule, never an exception. The border writes the message.
  it.each([undefined, null, '', '  ', 'Lines', 'fit sort', '-fit', 7])(
    'should_give_the_code_of_the_rule_when_value_is_missing_empty_or_not_a_slug',
    (value) => {
      expect(GameId.of(value as unknown as string)).toEqual({
        ok: false,
        error: 'invalid-game-id',
      });
    },
  );
});

// A stored row keeps what it holds, so of() keeps no length bound (#135).
describe('GameId.of', () => {
  it('should_build_a_stored_game_id_over_the_bound_when_of_rebuilds_a_row', () => {
    expect(GameId.of('a'.repeat(200)).ok).toBe(true);
  });
});
