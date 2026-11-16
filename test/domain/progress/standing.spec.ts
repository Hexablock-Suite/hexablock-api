import { ElapsedTime } from '../../../src/domain/progress/elapsed-time.js';
import { LevelsCompleted } from '../../../src/domain/progress/levels-completed.js';
import { Moves } from '../../../src/domain/progress/moves.js';
import { Standing, type StandingReceiver } from '../../../src/domain/progress/standing.js';
import { Stars } from '../../../src/domain/progress/stars.js';
import type { Result } from '../../../src/domain/shared/result.js';
import { receiveValueOf } from '../../../src/adapters/received.js';

function created<T>(result: Result<T, string>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

// The totals of one player over the levels of one game: stars, levels
// completed, moves and time in milliseconds.
function standing(stars: number, levels: number, moves: number, elapsedMs: number): Standing {
  return created(
    Standing.of(
      Stars.of(stars),
      created(LevelsCompleted.of(levels)),
      Moves.of(moves),
      ElapsedTime.ofMs(elapsedMs),
    ),
  );
}

// A receiver of the border that keeps the four totals as numbers.
class RecordingStandingReceiver implements StandingReceiver {
  readonly received: number[][] = [];

  receive(stars: Stars, levels: LevelsCompleted, moves: Moves, elapsedTime: ElapsedTime): void {
    this.received.push([
      receiveValueOf(stars),
      receiveValueOf(levels),
      receiveValueOf(moves),
      receiveValueOf(elapsedTime),
    ]);
  }
}

describe('Standing', () => {
  it('should_deliver_the_four_totals_when_at_least_one_level_is_completed', () => {
    const receiver = new RecordingStandingReceiver();

    expect(standing(5, 2, 32, 100_000).deliverTo(receiver)).toBeUndefined();

    expect(receiver.received).toEqual([[5, 2, 32, 100_000]]);
  });

  // One failure mechanism: a failed Result with the code of the rule, never an exception.
  it('should_give_the_code_of_the_rule_when_no_level_is_completed', () => {
    const result = Standing.of(
      Stars.of(0),
      created(LevelsCompleted.of(0)),
      Moves.of(0),
      ElapsedTime.ofMs(0),
    );

    expect(result).toEqual({ ok: false, error: 'no-level-completed' });
  });

  // S3-03, step 1: more total stars wins, even with fewer levels, more moves and more time.
  it('should_rank_more_total_stars_first_when_the_other_totals_favor_the_other_player', () => {
    const more = standing(5, 1, 90, 900_000);
    const fewer = standing(4, 3, 10, 10_000);

    expect(more.isBetterThan(fewer)).toBe(true);
    expect(fewer.isBetterThan(more)).toBe(false);
  });

  // S3-03, step 2: on equal stars, more levels completed wins, even with more moves and more time.
  it('should_rank_more_levels_completed_first_when_the_total_stars_are_equal', () => {
    const more = standing(5, 3, 90, 900_000);
    const fewer = standing(5, 2, 10, 10_000);

    expect(more.isBetterThan(fewer)).toBe(true);
    expect(fewer.isBetterThan(more)).toBe(false);
  });

  // S3-03, step 3: on equal stars and levels, fewer total moves wins, even with more time.
  it('should_rank_fewer_total_moves_first_when_stars_and_levels_completed_are_equal', () => {
    const fewer = standing(5, 2, 30, 900_000);
    const more = standing(5, 2, 31, 10_000);

    expect(fewer.isBetterThan(more)).toBe(true);
    expect(more.isBetterThan(fewer)).toBe(false);
  });

  // S3-03, step 4: on equal stars, levels and moves, less total time wins.
  it('should_rank_less_total_time_first_when_stars_levels_and_moves_are_equal', () => {
    const shorter = standing(5, 2, 30, 59_999);
    const longer = standing(5, 2, 30, 60_000);

    expect(shorter.isBetterThan(longer)).toBe(true);
    expect(longer.isBetterThan(shorter)).toBe(false);
  });

  it('should_not_rank_either_standing_first_when_all_four_totals_are_equal', () => {
    const first = standing(5, 2, 30, 60_000);
    const second = standing(5, 2, 30, 60_000);

    expect(first.isBetterThan(second)).toBe(false);
    expect(second.isBetterThan(first)).toBe(false);
  });

  it('should_be_equal_only_when_all_four_totals_are_equal', () => {
    const first = standing(5, 2, 30, 60_000);

    expect(first.equals(standing(5, 2, 30, 60_000))).toBe(true);
    expect(first.equals(standing(6, 2, 30, 60_000))).toBe(false);
    expect(first.equals(standing(5, 3, 30, 60_000))).toBe(false);
    expect(first.equals(standing(5, 2, 31, 60_000))).toBe(false);
    expect(first.equals(standing(5, 2, 30, 60_001))).toBe(false);
  });
});
