import { ProgressDtoMapper } from '../../../src/adapters/http/progress-dto.mapper.js';
import { GameId } from '../../../src/domain/progress/game-id.js';
import { LevelResult } from '../../../src/domain/progress/level-result.js';
import { PlayerProgress } from '../../../src/domain/progress/player-progress.js';
import { Score } from '../../../src/domain/progress/score.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import { testUserId } from '../../support/user-ids.js';

const ADA = UserId.from(testUserId(1));
const LEVEL = { levelId: 'fit-01', stars: 3, moves: 12, elapsedMs: 45000 };
const BAD_GAME = 'Hexa Lines';
const BAD_LEVEL = { ...LEVEL, stars: -2 };
const GAME_PROBLEM = 'gameId must be a lowercase slug, got "Hexa Lines".';
const LEVEL_PROBLEM = 'stars must be a non-negative integer, got -2.';
const SCORE_PROBLEM = 'score must be a non-negative integer, got -1.';

// The mapper of the border builds the domain values of a request. A use
// case gets them built and never builds one from a loose primitive.
describe('ProgressDtoMapper.toRequest', () => {
  it('should_build_the_domain_values_of_the_sync_when_body_is_valid', () => {
    const request = ProgressDtoMapper.toRequest(
      { gameId: 'hexa-fit', score: 120, results: [LEVEL] },
      ADA,
    );

    if (!request.ok) {
      throw new Error('The mapper must build the request.');
    }
    expect(request.value.userId).toBe(ADA);
    expect(request.value.gameId.equals(GameId.of('hexa-fit'))).toBe(true);
    expect(request.value.score?.equals(Score.of(120))).toBe(true);
    expect(request.value.results).toHaveLength(1);
    expect(request.value.results[0]?.equals(LevelResult.of(LEVEL))).toBe(true);
  });

  it('should_build_no_score_and_no_results_when_body_has_only_a_game_id', () => {
    for (const body of [{ gameId: 'hexa-fit' }, { gameId: 'hexa-fit', score: null }]) {
      const request = ProgressDtoMapper.toRequest(body, ADA);

      if (!request.ok) {
        throw new Error('The mapper must build the request.');
      }
      expect(request.value.gameId.equals(GameId.of('hexa-fit'))).toBe(true);
      expect(request.value.score).toBeUndefined();
      expect(request.value.results).toEqual([]);
    }
  });

  it('should_fail_with_the_message_of_the_rule_when_one_value_breaks_its_rule', () => {
    for (const [body, problem] of [
      [{ gameId: BAD_GAME, score: 120 }, GAME_PROBLEM],
      [{ gameId: 'hexa-fit', results: [LEVEL, BAD_LEVEL] }, LEVEL_PROBLEM],
      [{ gameId: 'hexa-fit', score: -1 }, SCORE_PROBLEM],
    ] as const) {
      expect(ProgressDtoMapper.toRequest(body, ADA)).toEqual({ ok: false, error: [problem] });
    }
  });

  // The order of the checks is the game id, then the results, then the
  // score. The first broken rule gives the one problem of the answer.
  it('should_fail_with_the_first_problem_in_game_results_score_order_when_several_values_break_their_rules', () => {
    for (const [body, problem] of [
      [{ gameId: BAD_GAME, results: [BAD_LEVEL] }, GAME_PROBLEM],
      [{ gameId: BAD_GAME, score: -1 }, GAME_PROBLEM],
      [{ gameId: 'hexa-fit', score: -1, results: [BAD_LEVEL] }, LEVEL_PROBLEM],
      [{ gameId: BAD_GAME, score: -1, results: [BAD_LEVEL] }, GAME_PROBLEM],
    ] as const) {
      expect(ProgressDtoMapper.toRequest(body, ADA)).toEqual({ ok: false, error: [problem] });
    }
  });

  // The shape check comes first and reports every wrong type together.
  it('should_fail_with_every_shape_problem_when_body_fields_have_wrong_types', () => {
    const allWrong = ProgressDtoMapper.toRequest({ gameId: 5, score: 'x', results: 3 }, ADA);
    const shapeBeforeRule = ProgressDtoMapper.toRequest({ gameId: 5, score: -1 }, ADA);
    const noBody = ProgressDtoMapper.toRequest(undefined, ADA);

    expect(allWrong).toEqual({
      ok: false,
      error: [
        'gameId must be a string',
        'score must be a number',
        'results must be an array of objects',
      ],
    });
    expect(shapeBeforeRule).toEqual({ ok: false, error: ['gameId must be a string'] });
    expect(noBody).toEqual({ ok: false, error: ['gameId must be a string'] });
  });
});

describe('ProgressDtoMapper.toGetRequest', () => {
  it('should_build_the_game_id_of_the_read_when_path_value_is_a_slug', () => {
    const request = ProgressDtoMapper.toGetRequest('hexa-lines', ADA);

    if (!request.ok) {
      throw new Error('The mapper must build the request.');
    }
    expect(request.value.userId).toBe(ADA);
    expect(request.value.gameId.equals(GameId.of('hexa-lines'))).toBe(true);
  });

  it('should_fail_with_the_message_of_the_rule_when_path_value_is_not_a_slug', () => {
    expect(ProgressDtoMapper.toGetRequest(BAD_GAME, ADA)).toEqual({
      ok: false,
      error: [GAME_PROBLEM],
    });
  });
});

// The JSON body keeps numbers and strings: the wire format does not change.
describe('ProgressDtoMapper.toDto', () => {
  it('should_write_plain_numbers_and_strings_when_progress_becomes_a_dto', () => {
    const at = new Date('2026-11-06T10:00:00.000Z');
    const progress = PlayerProgress.start(ADA, GameId.of('hexa-fit'), at);
    progress.recordScore(Score.of(120), at);
    progress.recordLevel(LevelResult.of(LEVEL));

    expect(ProgressDtoMapper.toDto(progress)).toEqual({
      gameId: 'hexa-fit',
      highScore: 120,
      updatedAt: '2026-11-06T10:00:00.000Z',
      results: [LEVEL],
    });
  });
});
