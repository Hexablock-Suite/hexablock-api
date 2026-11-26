import { GameId } from '../../../src/domain/progress/game-id.js';
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

  it('should_be_equal_when_two_game_ids_hold_the_same_value', () => {
    expect(gameId('fit').equals(gameId('fit'))).toBe(true);
    expect(gameId('fit').equals(gameId('sort'))).toBe(false);
  });

  // #90: the value leaves only through a delivery to a receiver.
  it('should_deliver_the_value_to_the_receiver_when_the_factory_took_it', () => {
    const receiver = new RecordingReceiver<string>();

    gameId('fit').deliverTo(receiver);

    expect(receiver.received).toEqual(['fit']);
  });

  it('should_have_no_public_value_field_when_the_value_leaves_through_a_delivery', () => {
    const built = gameId('fit');
    const receiver = new RecordingReceiver<string>();

    // @ts-expect-error -- #90 makes the value private.
    void built.value;
    // The delivery returns nothing: the receiver holds the value.
    expect(built.deliverTo(receiver)).toBeUndefined();
  });
});

// A stored row keeps what it holds, so of() keeps no length bound (#135).
describe('GameId.of', () => {
  it('should_build_a_stored_game_id_over_the_bound_when_of_rebuilds_a_row', () => {
    expect(GameId.of('a'.repeat(200)).ok).toBe(true);
  });
});
