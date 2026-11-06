import { GameId } from '../../../src/domain/progress/game-id.js';
import { LevelResult } from '../../../src/domain/progress/level-result.js';
import { PlayerProgress } from '../../../src/domain/progress/player-progress.js';
import { ProgressError } from '../../../src/domain/progress/progress-error.js';
import { UserId } from '../../../src/domain/progress/user-id.js';

const USER = UserId.of('user-1');
const FIT = GameId.of('fit');
const START = new Date('2026-11-06T10:00:00.000Z');
const LATER = new Date('2026-11-06T10:05:00.000Z');

function level(levelId: string, stars: number): LevelResult {
  return LevelResult.of({ levelId, stars, moves: 10, elapsedMs: 30_000 });
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

    progress.recordScore(120, LATER);
    progress.recordLevel(level('fit-01', 2));

    expect(progress.userId.equals(USER)).toBe(true);
    expect(progress.gameId.equals(FIT)).toBe(true);
  });

  it('should_record_the_score_and_take_the_given_instant_when_score_is_recorded', () => {
    const progress = PlayerProgress.start(USER, FIT, START);

    progress.recordScore(120, LATER);

    expect(progress.highScore).toBe(120);
    expect(progress.updatedAt.toISOString()).toBe(LATER.toISOString());
  });

  it('should_keep_the_high_score_and_take_the_instant_when_a_lower_score_is_recorded', () => {
    const progress = PlayerProgress.start(USER, FIT, START);
    progress.recordScore(120, START);

    progress.recordScore(80, LATER);

    expect(progress.highScore).toBe(120);
    expect(progress.updatedAt.toISOString()).toBe(LATER.toISOString());
  });

  it('should_reject_score_and_keep_state_when_score_is_negative_or_not_an_integer', () => {
    const progress = PlayerProgress.start(USER, FIT, START);
    progress.recordScore(50, START);

    for (const bad of [-1, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => progress.recordScore(bad, LATER)).toThrow(ProgressError);
    }
    expect(() => progress.recordScore(60, new Date(Number.NaN))).toThrow(ProgressError);

    expect(progress.highScore).toBe(50);
    expect(progress.updatedAt.toISOString()).toBe(START.toISOString());
  });

  it('should_add_the_level_result_when_level_is_recorded', () => {
    const progress = PlayerProgress.start(USER, FIT, START);
    const first = level('fit-01', 2);
    const second = level('fit-02', 3);

    progress.recordLevel(first);
    progress.recordLevel(second);

    expect(progress.results).toEqual([first, second]);
  });

  // Assumption until DS-4 (#24): one result per levelId, as the level_results
  // key of DS-5; the last recorded result replaces the earlier one.
  it('should_keep_one_result_per_level_when_same_level_is_recorded_again', () => {
    const progress = PlayerProgress.start(USER, FIT, START);
    const second = level('fit-02', 1);
    const retry = level('fit-01', 3);
    progress.recordLevel(level('fit-01', 2));
    progress.recordLevel(second);

    progress.recordLevel(retry);

    expect(progress.results).toEqual([retry, second]);
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
    progress.recordScore(10, at);

    at.setUTCFullYear(1999);

    expect(progress.updatedAt.toISOString()).toBe(LATER.toISOString());
  });
});
