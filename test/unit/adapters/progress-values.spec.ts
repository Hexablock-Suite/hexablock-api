import {
  INCOMING_ID_BOUNDS,
  gameIdFrom,
  levelIdFrom,
  movesFrom,
  MOST_MOVES,
  MOST_STARS,
  starsFrom,
} from '../../../src/adapters/http/progress-values.js';
import { GameId } from '../../../src/domain/progress/game-id.js';
import { LevelId } from '../../../src/domain/progress/level-id.js';
import { Moves } from '../../../src/domain/progress/moves.js';
import { Stars } from '../../../src/domain/progress/stars.js';
import { valueOf } from '../../support/result.js';

// #179: the bounds of a value that a client sends live at the HTTP border,
// because they exist only for the Postgres columns. The domain builds a
// stored row with of(), which keeps no incoming bound. Each builder returns
// the text of its rule, and test/progress-bounds.e2e-spec.ts and
// test/progress-path-bounds.e2e-spec.ts pin the same texts on the wire.

const gameId = (value: string): GameId => valueOf(GameId.of(value));
const levelId = (value: string): LevelId => valueOf(LevelId.of(value));
const stars = (value: number): Stars => valueOf(Stars.of(value));
const moves = (value: number): Moves => valueOf(Moves.of(value));

describe('gameIdFrom', () => {
  it.each(['a'.repeat(65), 'a'.repeat(200), 'Lines', '', 'fit\u0000'])(
    'should_give_the_text_of_the_rule_when_an_incoming_game_id_is_too_long_or_not_a_slug',
    (bad) => {
      expect(gameIdFrom(bad)).toEqual({
        ok: false,
        error: `gameId must be a lowercase slug of 1 to 64 characters, got ${JSON.stringify(bad)}.`,
      });
    },
  );

  it.each(['hexa-fit', 'a'.repeat(64)])(
    'should_build_the_game_id_when_an_incoming_slug_has_at_most_64_characters',
    (value) => {
      expect(valueOf(gameIdFrom(value)).equals(gameId(value))).toBe(true);
    },
  );
});

describe('levelIdFrom', () => {
  it.each([
    'f'.repeat(65),
    'f'.repeat(10_000),
    'fi\u0000t',
    'fit\n01',
    'fit\u001f',
    '\u007ffit',
    '  ',
  ])(
    'should_give_the_text_of_the_rule_when_an_incoming_level_id_is_too_long_or_holds_a_control_character',
    (bad) => {
      expect(levelIdFrom(bad)).toEqual({
        ok: false,
        error:
          'levelId must be a non-blank string of 1 to 64 characters with no control character.',
      });
    },
  );

  // A character is one code point, so an emoji counts once.
  it.each(['fit-01', 'f'.repeat(64), '😀'.repeat(64), 'nivel ñ 01'])(
    'should_build_the_level_id_when_an_incoming_id_has_at_most_64_characters_and_no_control_character',
    (value) => {
      expect(valueOf(levelIdFrom(value)).equals(levelId(value))).toBe(true);
    },
  );
});

describe('starsFrom', () => {
  it.each([2_147_483_648, 3_000_000_000, -1, 1.5])(
    'should_give_the_text_of_the_rule_when_the_stars_of_a_play_exceed_the_column_or_break_the_rule',
    (bad) => {
      expect(starsFrom(bad)).toEqual({
        ok: false,
        error: `stars must be a non-negative integer of at most 2147483647, got ${String(bad)}.`,
      });
    },
  );

  it.each([0, 3, 2_147_483_647])(
    'should_build_the_stars_when_the_stars_of_a_play_fit_the_column',
    (value) => {
      expect(valueOf(starsFrom(value)).equals(stars(value))).toBe(true);
    },
  );
});

describe('movesFrom', () => {
  it.each([2_147_483_648, 3_000_000_000, -1, 1.5])(
    'should_give_the_text_of_the_rule_when_the_moves_of_a_play_exceed_the_column_or_break_the_rule',
    (bad) => {
      expect(movesFrom(bad)).toEqual({
        ok: false,
        error: `moves must be a non-negative integer of at most 2147483647, got ${String(bad)}.`,
      });
    },
  );

  it.each([0, 12, 2_147_483_647])(
    'should_build_the_moves_when_the_moves_of_a_play_fit_the_column',
    (value) => {
      expect(valueOf(movesFrom(value)).equals(moves(value))).toBe(true);
    },
  );
});

// The DTOs publish the bounds as the OpenAPI limits, and the texts of the
// rules name them, so the numbers have one home here.
describe('the bounds of an incoming value', () => {
  it('should_publish_the_column_bounds_when_the_dtos_build_the_openapi_limits', () => {
    expect(INCOMING_ID_BOUNDS).toEqual({ min: 1, max: 64 });
    expect(MOST_STARS).toBe(2_147_483_647);
    expect(MOST_MOVES).toBe(2_147_483_647);
  });
});
