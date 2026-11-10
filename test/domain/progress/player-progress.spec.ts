import { GameId } from '../../../src/domain/progress/game-id.js';
import { LevelResult } from '../../../src/domain/progress/level-result.js';
import { PlayerProgress } from '../../../src/domain/progress/player-progress.js';
import { Score } from '../../../src/domain/progress/score.js';
import { ProgressError } from '../../../src/domain/progress/progress-error.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import { testUserId } from '../../support/user-ids.js';

const USER = UserId.from(testUserId(1));
const FIT = GameId.of('fit');
const START = new Date('2026-11-06T10:00:00.000Z');
const LATER = new Date('2026-11-06T10:05:00.000Z');

function level(levelId: string, stars: number): LevelResult {
  return LevelResult.of({ levelId, stars, moves: 10, elapsedMs: 30_000 });
}

function attempt(stars: number, moves: number, elapsedMs: number): LevelResult {
  return LevelResult.of({ levelId: 'fit-01', stars, moves, elapsedMs });
}

// Records the two results of one level in the given order, after a result of
// another level. It returns the results that the progress keeps.
function keptAfter(first: LevelResult, second: LevelResult): LevelResult[] {
  const progress = PlayerProgress.start(USER, FIT, START);
  progress.recordLevel(level('fit-02', 1));
  progress.recordLevel(first);
  progress.recordLevel(second);
  return progress.results;
}

describe('PlayerProgress', () => {
  it('should_start_with_no_high_score_and_no_results_when_progress_is_started', () => {
    const progress = PlayerProgress.start(USER, FIT, START);

    expect(progress.userId.equals(USER)).toBe(true);
    expect(progress.gameId.equals(FIT)).toBe(true);
    expect(progress.highScore).toBeNull();
    expect(progress.updatedAt.toISOString()).toBe(START.toISOString());
    expect(progress.results).toEqual([]);
  });

  it('should_reject_progress_when_game_id_is_missing', () => {
    expect(() => PlayerProgress.start(USER, undefined as unknown as GameId, START)).toThrow(
      ProgressError,
    );
    expect(() => PlayerProgress.start(USER, 'fit' as unknown as GameId, START)).toThrow(
      ProgressError,
    );
  });

  it('should_reject_progress_when_user_id_or_instant_is_missing', () => {
    expect(() => PlayerProgress.start(undefined as unknown as UserId, FIT, START)).toThrow(
      ProgressError,
    );
    expect(() => PlayerProgress.start(USER, FIT, new Date(Number.NaN))).toThrow(ProgressError);
  });

  it('should_keep_its_user_and_game_key_when_scores_and_levels_are_recorded', () => {
    const progress = PlayerProgress.start(USER, FIT, START);

    progress.recordScore(Score.of(120), LATER);
    progress.recordLevel(level('fit-01', 2));

    expect(progress.userId.equals(USER)).toBe(true);
    expect(progress.gameId.equals(FIT)).toBe(true);
  });

  it('should_record_the_score_and_take_the_given_instant_when_score_is_recorded', () => {
    const progress = PlayerProgress.start(USER, FIT, START);

    progress.recordScore(Score.of(120), LATER);

    expect(progress.highScore?.equals(Score.of(120))).toBe(true);
    expect(progress.updatedAt.toISOString()).toBe(LATER.toISOString());
  });

  it('should_keep_the_high_score_and_take_the_instant_when_a_lower_score_is_recorded', () => {
    const progress = PlayerProgress.start(USER, FIT, START);
    progress.recordScore(Score.of(120), START);

    progress.recordScore(Score.of(80), LATER);

    expect(progress.highScore?.equals(Score.of(120))).toBe(true);
    expect(progress.updatedAt.toISOString()).toBe(LATER.toISOString());
  });

  // Score guards the rule of a valid score. The aggregate takes only a Score.
  it('should_reject_score_and_keep_state_when_score_is_not_a_score_or_instant_is_invalid', () => {
    const progress = PlayerProgress.start(USER, FIT, START);
    progress.recordScore(Score.of(50), START);

    for (const bad of [60, undefined, null]) {
      expect(() => progress.recordScore(bad as unknown as Score, LATER)).toThrow(ProgressError);
    }
    expect(() => progress.recordScore(Score.of(60), new Date(Number.NaN))).toThrow(ProgressError);

    expect(progress.highScore?.equals(Score.of(50))).toBe(true);
    expect(progress.updatedAt.toISOString()).toBe(START.toISOString());
  });

  it('should_take_the_higher_score_when_a_higher_score_is_recorded', () => {
    const progress = PlayerProgress.start(USER, FIT, START);
    progress.recordScore(Score.of(120), START);

    progress.recordScore(Score.of(121), LATER);

    expect(progress.highScore?.equals(Score.of(121))).toBe(true);
  });

  // A score of 0 is a score. Only a progress with no record has no high score.
  it('should_tell_a_zero_high_score_from_no_score_when_zero_is_recorded', () => {
    const progress = PlayerProgress.start(USER, FIT, START);

    progress.recordScore(Score.of(0), LATER);

    expect(progress.highScore).not.toBeNull();
    expect(progress.highScore?.equals(Score.of(0))).toBe(true);
  });

  // -0 is a non-negative integer: -0 < 0 is false. It counts as a zero score.
  it('should_record_a_zero_score_when_score_is_negative_zero', () => {
    const progress = PlayerProgress.start(USER, FIT, START);

    progress.recordScore(Score.of(-0), LATER);

    expect(progress.highScore?.equals(Score.of(0))).toBe(true);
    expect(progress.updatedAt.toISOString()).toBe(LATER.toISOString());
  });

  it('should_add_the_level_result_when_level_is_recorded', () => {
    const progress = PlayerProgress.start(USER, FIT, START);
    const first = level('fit-01', 2);
    const second = level('fit-02', 3);

    progress.recordLevel(first);
    progress.recordLevel(second);

    expect(progress.results).toEqual([first, second]);
  });

  // One result per levelId, as the level_results key of DS-5. A better result
  // takes the place of the stored one (DS-4, DS-12).
  it('should_keep_one_result_per_level_when_same_level_is_recorded_again', () => {
    const progress = PlayerProgress.start(USER, FIT, START);
    const second = level('fit-02', 1);
    const retry = level('fit-01', 3);
    progress.recordLevel(level('fit-01', 2));
    progress.recordLevel(second);

    progress.recordLevel(retry);

    expect(progress.results).toEqual([retry, second]);
  });

  // DS-4 orders the results of one level: more stars, then fewer moves, then
  // less time. DS-12 keeps the best one, so the order of the records does
  // not change what stays.
  it('should_keep_the_result_with_more_stars_when_it_has_more_moves_and_time', () => {
    const better = attempt(3, 25, 90_000);
    const worse = attempt(2, 10, 30_000);

    for (const [first, second] of [
      [better, worse],
      [worse, better],
    ] as const) {
      expect(keptAfter(first, second)).toEqual([level('fit-02', 1), better]);
    }
  });

  it('should_keep_the_result_with_fewer_moves_when_stars_are_equal_and_it_has_more_time', () => {
    const better = attempt(2, 12, 90_000);
    const worse = attempt(2, 13, 30_000);

    for (const [first, second] of [
      [better, worse],
      [worse, better],
    ] as const) {
      expect(keptAfter(first, second)).toEqual([level('fit-02', 1), better]);
    }
  });

  it('should_keep_the_result_with_less_time_when_stars_and_moves_are_equal', () => {
    const better = attempt(2, 12, 44_999);
    const worse = attempt(2, 12, 45_000);

    for (const [first, second] of [
      [better, worse],
      [worse, better],
    ] as const) {
      expect(keptAfter(first, second)).toEqual([level('fit-02', 1), better]);
    }
  });

  it('should_keep_the_stored_result_when_a_new_result_ties_on_stars_moves_and_time', () => {
    const stored = attempt(2, 12, 45_000);
    const tie = attempt(2, 12, 45_000);

    const kept = keptAfter(stored, tie);

    expect(kept).toEqual([level('fit-02', 1), stored]);
    expect(kept[1]).toBe(stored);
    expect(kept[1]).not.toBe(tie);
  });

  it('should_keep_the_better_result_when_a_worse_result_of_the_level_is_recorded_after_it', () => {
    const progress = PlayerProgress.start(USER, FIT, START);
    const best = attempt(3, 9, 30_000);
    const other = level('fit-02', 1);
    progress.recordLevel(best);
    progress.recordLevel(other);

    progress.recordLevel(attempt(1, 30, 120_000));
    progress.recordLevel(attempt(3, 9, 30_001));

    expect(progress.results).toEqual([best, other]);
    expect(progress.results[0]).toBe(best);
  });

  it('should_reject_level_and_keep_results_when_result_is_missing', () => {
    const progress = PlayerProgress.start(USER, FIT, START);

    expect(() => progress.recordLevel(undefined as unknown as LevelResult)).toThrow(ProgressError);

    expect(progress.results).toEqual([]);
  });

  it('should_keep_its_state_when_caller_mutates_returned_date_or_results', () => {
    const progress = PlayerProgress.start(USER, FIT, START);
    progress.recordLevel(level('fit-01', 2));

    progress.updatedAt.setUTCFullYear(1999);
    progress.results.pop();

    expect(progress.updatedAt.toISOString()).toBe(START.toISOString());
    expect(progress.results).toHaveLength(1);
  });

  it('should_keep_its_instant_when_caller_mutates_the_date_it_passed', () => {
    const at = new Date(LATER.getTime());
    const progress = PlayerProgress.start(USER, FIT, START);
    progress.recordScore(Score.of(10), at);

    at.setUTCFullYear(1999);

    expect(progress.updatedAt.toISOString()).toBe(LATER.toISOString());
  });

  it('should_return_the_stored_state_when_progress_is_restored', () => {
    const first = level('fit-01', 2);
    const second = level('fit-02', 3);

    const progress = PlayerProgress.restore({
      userId: USER,
      gameId: FIT,
      highScore: Score.of(120),
      updatedAt: LATER,
      results: [first, second],
    });

    expect(progress.userId.equals(USER)).toBe(true);
    expect(progress.gameId.equals(FIT)).toBe(true);
    expect(progress.highScore?.equals(Score.of(120))).toBe(true);
    expect(progress.updatedAt.toISOString()).toBe(LATER.toISOString());
    expect(progress.results).toEqual([first, second]);
  });

  it('should_restore_no_high_score_when_stored_high_score_is_null', () => {
    const progress = PlayerProgress.restore({
      userId: USER,
      gameId: FIT,
      highScore: null,
      updatedAt: START,
      results: [],
    });

    expect(progress.highScore).toBeNull();
    expect(progress.results).toEqual([]);
  });

  it('should_reject_restore_when_stored_state_breaks_a_rule', () => {
    const valid = {
      userId: USER,
      gameId: FIT,
      highScore: Score.of(1),
      updatedAt: START,
      results: [],
    };

    for (const highScore of [1, undefined]) {
      expect(() =>
        PlayerProgress.restore({ ...valid, highScore: highScore as unknown as Score }),
      ).toThrow(ProgressError);
    }
    expect(() => PlayerProgress.restore({ ...valid, updatedAt: new Date(Number.NaN) })).toThrow(
      ProgressError,
    );
    expect(() => PlayerProgress.restore({ ...valid, gameId: 'fit' as unknown as GameId })).toThrow(
      ProgressError,
    );
    expect(() =>
      PlayerProgress.restore({ ...valid, results: [undefined as unknown as LevelResult] }),
    ).toThrow(ProgressError);
  });

  // Score counts -0 as a zero score, and restore() keeps it.
  it('should_restore_a_zero_high_score_when_stored_high_score_is_negative_zero', () => {
    const progress = PlayerProgress.restore({
      userId: USER,
      gameId: FIT,
      highScore: Score.of(-0),
      updatedAt: START,
      results: [],
    });

    expect(progress.highScore?.equals(Score.of(0))).toBe(true);
  });

  // restore() records each stored result with recordLevel(), so the rule of
  // one result per levelId holds: the best result of a levelId stays (DS-4).
  it('should_keep_the_best_result_per_level_when_stored_results_repeat_a_level_id', () => {
    const best = level('fit-01', 3);
    const second = level('fit-02', 1);

    const progress = PlayerProgress.restore({
      userId: USER,
      gameId: FIT,
      highScore: null,
      updatedAt: START,
      results: [best, second, level('fit-01', 2)],
    });

    expect(progress.results).toEqual([best, second]);
  });
});

describe('PlayerProgress identity', () => {
  it('should_be_the_same_progress_when_user_and_game_match_whatever_the_rest_holds', () => {
    const played = PlayerProgress.restore({
      userId: USER,
      gameId: FIT,
      highScore: Score.of(900),
      updatedAt: LATER,
      results: [level('fit-01', 3)],
    });
    const fresh = PlayerProgress.start(UserId.from(testUserId(1)), GameId.of('fit'), START);
    const otherUser = PlayerProgress.start(UserId.from(testUserId(2)), FIT, START);
    const otherGame = PlayerProgress.start(USER, GameId.of('sort'), START);

    expect(fresh).not.toBe(played);
    expect(played.equals(fresh)).toBe(true);
    expect(fresh.equals(played)).toBe(true);
    for (const other of [otherUser, otherGame]) {
      expect(fresh.equals(other)).toBe(false);
      expect(other.equals(fresh)).toBe(false);
    }
  });
});
