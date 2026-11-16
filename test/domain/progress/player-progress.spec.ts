import { GameId } from '../../../src/domain/progress/game-id.js';
import type { LevelResult } from '../../../src/domain/progress/level-result.js';
import { PlayerProgress } from '../../../src/domain/progress/player-progress.js';
import { Score } from '../../../src/domain/progress/score.js';
import { ProgressError } from '../../../src/domain/progress/progress-error.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import { levelResultOf } from '../../support/level-results.js';
import { type ProgressParts, progressPartsOf } from '../../support/recording-receiver.js';
import { testUserId } from '../../support/user-ids.js';

const USER = UserId.from(testUserId(1));
const FIT = GameId.of('fit');
const START = new Date('2026-11-06T10:00:00.000Z');
const LATER = new Date('2026-11-06T10:05:00.000Z');

function level(levelId: string, stars: number): LevelResult {
  return levelResultOf({ levelId, stars, moves: 10, elapsedMs: 30_000 });
}

function attempt(stars: number, moves: number, elapsedMs: number): LevelResult {
  return levelResultOf({ levelId: 'fit-01', stars, moves, elapsedMs });
}

// Restores a progress from its parts, as ProgressRowMapper does: start()
// takes the key and the instant, and restore() records the rest.
function restoreFrom({
  userId,
  gameId,
  highScore,
  updatedAt,
  results,
}: ProgressParts): PlayerProgress {
  return PlayerProgress.restore(
    PlayerProgress.start(userId, gameId, updatedAt),
    highScore,
    results,
  );
}

// Records the two results of one level in the given order, after a result of
// another level. It returns the results that the progress keeps.
function keptAfter(first: LevelResult, second: LevelResult): readonly LevelResult[] {
  const progress = PlayerProgress.start(USER, FIT, START);
  progress.recordLevel(level('fit-02', 1));
  progress.recordLevel(first);
  progress.recordLevel(second);
  return progressPartsOf(progress).results;
}

describe('PlayerProgress', () => {
  it('should_start_with_no_high_score_and_no_results_when_progress_is_started', () => {
    const progress = PlayerProgress.start(USER, FIT, START);

    expect(progressPartsOf(progress).userId.equals(USER)).toBe(true);
    expect(progressPartsOf(progress).gameId.equals(FIT)).toBe(true);
    expect(progressPartsOf(progress).highScore).toBeNull();
    expect(progressPartsOf(progress).updatedAt.toISOString()).toBe(START.toISOString());
    expect(progressPartsOf(progress).results).toEqual([]);
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

    expect(progressPartsOf(progress).userId.equals(USER)).toBe(true);
    expect(progressPartsOf(progress).gameId.equals(FIT)).toBe(true);
  });

  it('should_record_the_score_and_take_the_given_instant_when_score_is_recorded', () => {
    const progress = PlayerProgress.start(USER, FIT, START);

    progress.recordScore(Score.of(120), LATER);

    expect(progressPartsOf(progress).highScore?.equals(Score.of(120))).toBe(true);
    expect(progressPartsOf(progress).updatedAt.toISOString()).toBe(LATER.toISOString());
  });

  it('should_keep_the_high_score_and_take_the_instant_when_a_lower_score_is_recorded', () => {
    const progress = PlayerProgress.start(USER, FIT, START);
    progress.recordScore(Score.of(120), START);

    progress.recordScore(Score.of(80), LATER);

    expect(progressPartsOf(progress).highScore?.equals(Score.of(120))).toBe(true);
    expect(progressPartsOf(progress).updatedAt.toISOString()).toBe(LATER.toISOString());
  });

  // Score guards the rule of a valid score. The aggregate takes only a Score.
  it.each([
    [60 as unknown as Score, LATER],
    [undefined as unknown as Score, LATER],
    [null as unknown as Score, LATER],
    [Score.of(60), new Date(Number.NaN)],
  ])(
    'should_reject_score_and_keep_state_when_score_is_not_a_score_or_instant_is_invalid',
    (score, at) => {
      const progress = PlayerProgress.start(USER, FIT, START);
      progress.recordScore(Score.of(50), START);

      expect(() => progress.recordScore(score, at)).toThrow(ProgressError);

      expect(progressPartsOf(progress).highScore?.equals(Score.of(50))).toBe(true);
      expect(progressPartsOf(progress).updatedAt.toISOString()).toBe(START.toISOString());
    },
  );

  it('should_take_the_higher_score_when_a_higher_score_is_recorded', () => {
    const progress = PlayerProgress.start(USER, FIT, START);
    progress.recordScore(Score.of(120), START);

    progress.recordScore(Score.of(121), LATER);

    expect(progressPartsOf(progress).highScore?.equals(Score.of(121))).toBe(true);
  });

  // A score of 0 is a score. Only a progress with no record has no high score.
  it('should_tell_a_zero_high_score_from_no_score_when_zero_is_recorded', () => {
    const progress = PlayerProgress.start(USER, FIT, START);

    progress.recordScore(Score.of(0), LATER);

    expect(progressPartsOf(progress).highScore).not.toBeNull();
    expect(progressPartsOf(progress).highScore?.equals(Score.of(0))).toBe(true);
  });

  // -0 is a non-negative integer: -0 < 0 is false. It counts as a zero score.
  it('should_record_a_zero_score_when_score_is_negative_zero', () => {
    const progress = PlayerProgress.start(USER, FIT, START);

    progress.recordScore(Score.of(-0), LATER);

    expect(progressPartsOf(progress).highScore?.equals(Score.of(0))).toBe(true);
    expect(progressPartsOf(progress).updatedAt.toISOString()).toBe(LATER.toISOString());
  });

  it('should_add_the_level_result_when_level_is_recorded', () => {
    const progress = PlayerProgress.start(USER, FIT, START);
    const first = level('fit-01', 2);
    const second = level('fit-02', 3);

    progress.recordLevel(first);
    progress.recordLevel(second);

    expect(progressPartsOf(progress).results).toEqual([first, second]);
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

    expect(progressPartsOf(progress).results).toEqual([retry, second]);
  });

  // DS-4 orders the results of one level: more stars, then fewer moves, then
  // less time. DS-12 keeps the best one, so the order of the records does
  // not change what stays. Each step of the order has two rows, one per
  // order of the records. This test is the one place that pins the order
  // through the aggregate. A row gives the first record, the second record
  // and the result that stays.
  const moreStars = attempt(3, 25, 90_000);
  const fewerStars = attempt(2, 10, 30_000);
  const fewerMoves = attempt(2, 12, 90_000);
  const moreMoves = attempt(2, 13, 30_000);
  const lessTime = attempt(2, 12, 44_999);
  const moreTime = attempt(2, 12, 45_000);
  it.each([
    // More stars wins over more moves and more time.
    [moreStars, fewerStars, moreStars],
    [fewerStars, moreStars, moreStars],
    // On equal stars, fewer moves wins over more time.
    [fewerMoves, moreMoves, fewerMoves],
    [moreMoves, fewerMoves, fewerMoves],
    // On equal stars and moves, less time wins.
    [lessTime, moreTime, lessTime],
    [moreTime, lessTime, lessTime],
  ])(
    'should_keep_the_result_with_more_stars_then_fewer_moves_then_less_time_when_a_level_is_recorded_twice',
    (first, second, better) => {
      expect(keptAfter(first, second)).toEqual([level('fit-02', 1), better]);
    },
  );

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

    expect(progressPartsOf(progress).results).toEqual([best, other]);
    expect(progressPartsOf(progress).results[0]).toBe(best);
  });

  it('should_reject_level_and_keep_results_when_result_is_missing', () => {
    const progress = PlayerProgress.start(USER, FIT, START);

    expect(() => progress.recordLevel(undefined as unknown as LevelResult)).toThrow(ProgressError);

    expect(progressPartsOf(progress).results).toEqual([]);
  });

  it('should_keep_its_instant_when_caller_mutates_the_date_it_passed', () => {
    const at = new Date(LATER.getTime());
    const progress = PlayerProgress.start(USER, FIT, START);
    progress.recordScore(Score.of(10), at);

    at.setUTCFullYear(1999);

    expect(progressPartsOf(progress).updatedAt.toISOString()).toBe(LATER.toISOString());
  });

  it('should_return_the_stored_state_when_progress_is_restored', () => {
    const first = level('fit-01', 2);
    const second = level('fit-02', 3);

    const progress = restoreFrom({
      userId: USER,
      gameId: FIT,
      highScore: Score.of(120),
      updatedAt: LATER,
      results: [first, second],
    });

    expect(progressPartsOf(progress).userId.equals(USER)).toBe(true);
    expect(progressPartsOf(progress).gameId.equals(FIT)).toBe(true);
    expect(progressPartsOf(progress).highScore?.equals(Score.of(120))).toBe(true);
    expect(progressPartsOf(progress).updatedAt.toISOString()).toBe(LATER.toISOString());
    expect(progressPartsOf(progress).results).toEqual([first, second]);
  });

  it('should_restore_no_high_score_when_stored_high_score_is_null', () => {
    const progress = restoreFrom({
      userId: USER,
      gameId: FIT,
      highScore: null,
      updatedAt: START,
      results: [],
    });

    expect(progressPartsOf(progress).highScore).toBeNull();
    expect(progressPartsOf(progress).results).toEqual([]);
  });

  // start() checks the key and the instant, and restore() checks the score
  // and each result: the same rules as start(), recordScore() and recordLevel().
  it.each<Partial<ProgressParts>>([
    { highScore: 1 as unknown as Score },
    { highScore: undefined as unknown as Score },
    { updatedAt: new Date(Number.NaN) },
    { gameId: 'fit' as unknown as GameId },
    { results: [undefined as unknown as LevelResult] },
  ])('should_reject_restore_when_stored_state_breaks_a_rule', (broken) => {
    const valid = {
      userId: USER,
      gameId: FIT,
      highScore: Score.of(1),
      updatedAt: START,
      results: [],
    };

    expect(() => restoreFrom({ ...valid, ...broken })).toThrow(ProgressError);
  });

  // restore() builds on a progress that start() made, so it needs one.
  it.each([undefined, null, {}])(
    'should_reject_restore_when_it_gets_no_started_progress',
    (started) => {
      expect(() =>
        PlayerProgress.restore(started as unknown as PlayerProgress, Score.of(1), []),
      ).toThrow(ProgressError);
    },
  );

  it('should_keep_started_unchanged_and_reject_a_non_progress_when_restore_runs', () => {
    const started = PlayerProgress.start(USER, GameId.of('hexa-lines'), new Date(0));
    const before = JSON.stringify(progressPartsOf(started));
    PlayerProgress.restore(started, Score.of(9), []);
    expect(JSON.stringify(progressPartsOf(started))).toBe(before);
    expect(() => PlayerProgress.restore({} as PlayerProgress, null, [])).toThrow(
      'restore needs a progress that start() made.',
    );
  });

  // restore() takes the key and the instant of the started progress, and
  // records the stored values. The records of the started progress do not count.
  it('should_keep_the_key_and_the_instant_and_the_stored_values_when_restore_builds_on_a_started_progress', () => {
    const started = PlayerProgress.start(USER, FIT, LATER);
    started.recordScore(Score.of(900), LATER);
    started.recordLevel(level('fit-02', 3));
    const stored = level('fit-01', 1);

    const progress = PlayerProgress.restore(started, Score.of(10), [stored]);

    expect(progress).not.toBe(started);
    expect(progressPartsOf(progress).userId.equals(USER)).toBe(true);
    expect(progressPartsOf(progress).gameId.equals(FIT)).toBe(true);
    expect(progressPartsOf(progress).highScore?.equals(Score.of(10))).toBe(true);
    expect(progressPartsOf(progress).updatedAt.toISOString()).toBe(LATER.toISOString());
    expect(progressPartsOf(progress).results).toEqual([stored]);
    expect(progressPartsOf(started).highScore?.equals(Score.of(900))).toBe(true);
    expect(progressPartsOf(started).results).toEqual([level('fit-02', 3)]);
  });

  // Score counts -0 as a zero score, and restore() keeps it.
  it('should_restore_a_zero_high_score_when_stored_high_score_is_negative_zero', () => {
    const progress = restoreFrom({
      userId: USER,
      gameId: FIT,
      highScore: Score.of(-0),
      updatedAt: START,
      results: [],
    });

    expect(progressPartsOf(progress).highScore?.equals(Score.of(0))).toBe(true);
  });

  // restore() records each stored result with recordLevel(), so the rule of
  // one result per levelId holds: the best result of a levelId stays (DS-4).
  it('should_keep_the_best_result_per_level_when_stored_results_repeat_a_level_id', () => {
    const best = level('fit-01', 3);
    const second = level('fit-02', 1);

    const progress = restoreFrom({
      userId: USER,
      gameId: FIT,
      highScore: null,
      updatedAt: START,
      results: [best, second, level('fit-01', 2)],
    });

    expect(progressPartsOf(progress).results).toEqual([best, second]);
  });
});

// #96: the aggregate delivers its parts to a receiver of the border, as a
// value object delivers its datum (decision 15). This is the Memento of
// Millett and Tune: the receiver gets domain values, and the mappers read them.
describe('PlayerProgress delivery', () => {
  // Keeps the arguments of each call to receive().
  function deliveriesOf(progress: PlayerProgress): unknown[][] {
    const calls: unknown[][] = [];
    progress.deliverTo({
      receive(...parts) {
        calls.push(parts);
      },
    });
    return calls;
  }

  it('should_deliver_its_key_score_instant_and_results_once_as_domain_values_when_it_delivers_to_a_receiver', () => {
    const first = level('fit-01', 2);
    const second = level('fit-02', 3);
    const progress = PlayerProgress.start(USER, FIT, START);
    progress.recordScore(Score.of(120), LATER);
    progress.recordLevel(first);
    progress.recordLevel(second);

    const calls = deliveriesOf(progress);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(5);
    const [userId, gameId, highScore, updatedAt, results] = calls[0];
    expect(userId).toBeInstanceOf(UserId);
    expect((userId as UserId).equals(USER)).toBe(true);
    expect(gameId).toBeInstanceOf(GameId);
    expect((gameId as GameId).equals(FIT)).toBe(true);
    expect(highScore).toBeInstanceOf(Score);
    expect((highScore as Score).equals(Score.of(120))).toBe(true);
    expect(updatedAt).toBeInstanceOf(Date);
    expect((updatedAt as Date).toISOString()).toBe(LATER.toISOString());
    expect(results).toEqual([first, second]);
    expect((results as LevelResult[])[0]).toBe(first);
  });

  it('should_deliver_no_high_score_and_no_results_when_a_started_progress_delivers', () => {
    const parts = progressPartsOf(PlayerProgress.start(USER, FIT, START));

    expect(parts.highScore).toBeNull();
    expect(parts.updatedAt.toISOString()).toBe(START.toISOString());
    expect(parts.results).toEqual([]);
  });

  // Each delivery gives a new Date and a new list, and the values are
  // immutable. So nothing that the receiver gets is a part of the aggregate.
  it('should_keep_its_state_when_the_receiver_changes_the_date_and_the_list_it_received', () => {
    const progress = PlayerProgress.start(USER, FIT, START);
    progress.recordScore(Score.of(50), START);
    progress.recordLevel(level('fit-01', 2));
    const received = progressPartsOf(progress);

    received.updatedAt.setUTCFullYear(1999);
    (received.results as LevelResult[]).pop();

    const after = progressPartsOf(progress);
    expect(after.updatedAt).not.toBe(received.updatedAt);
    expect(after.results).not.toBe(received.results);
    expect(after.updatedAt.toISOString()).toBe(START.toISOString());
    expect(after.results).toEqual([level('fit-01', 2)]);
    expect(after.highScore?.equals(Score.of(50))).toBe(true);
    expect(after.userId.equals(USER)).toBe(true);
    expect(after.gameId.equals(FIT)).toBe(true);
  });

  it('should_hold_the_same_data_when_restored_from_the_values_that_it_delivered', () => {
    const progress = PlayerProgress.start(USER, FIT, START);
    progress.recordScore(Score.of(120), LATER);
    progress.recordLevel(level('fit-01', 2));
    progress.recordLevel(level('fit-02', 3));

    const restored = restoreFrom(progressPartsOf(progress));

    expect(restored).not.toBe(progress);
    expect(restored.equals(progress)).toBe(true);
    expect(progressPartsOf(restored)).toEqual(progressPartsOf(progress));
  });

  // The delivery is the one read of the state, so the aggregate keeps no
  // getter, no snapshot and no public field of its key.
  it('should_have_no_getter_and_no_public_field_when_the_state_is_read_through_the_delivery', () => {
    const progress = PlayerProgress.start(USER, FIT, START);

    for (const name of ['highScore', 'updatedAt', 'results', 'snapshot']) {
      expect(name in progress).toBe(false);
    }
    // @ts-expect-error -- R16 removes the getter of highScore.
    void progress.highScore;
    // @ts-expect-error -- R16 removes the getter of updatedAt.
    void progress.updatedAt;
    // @ts-expect-error -- R16 removes the getter of results.
    void progress.results;
    // @ts-expect-error -- R16 makes the userId field private.
    void progress.userId;
    // @ts-expect-error -- R16 makes the gameId field private.
    void progress.gameId;
    // @ts-expect-error -- #96 replaces snapshot() with deliverTo().
    void progress.snapshot;
  });
});

describe('PlayerProgress identity', () => {
  it('should_be_the_same_progress_when_user_and_game_match_whatever_the_rest_holds', () => {
    const played = restoreFrom({
      userId: USER,
      gameId: FIT,
      highScore: Score.of(900),
      updatedAt: LATER,
      results: [level('fit-01', 3)],
    });
    const fresh = PlayerProgress.start(UserId.from(testUserId(1)), GameId.of('fit'), START);

    expect(fresh).not.toBe(played);
    expect(played.equals(fresh)).toBe(true);
    expect(fresh.equals(played)).toBe(true);
  });

  it.each([
    [UserId.from(testUserId(2)), FIT],
    [USER, GameId.of('sort')],
  ])('should_not_be_the_same_progress_when_the_user_or_the_game_differs', (userId, gameId) => {
    const progress = PlayerProgress.start(USER, FIT, START);
    const other = PlayerProgress.start(userId, gameId, START);

    expect(progress.equals(other)).toBe(false);
    expect(other.equals(progress)).toBe(false);
  });
});
