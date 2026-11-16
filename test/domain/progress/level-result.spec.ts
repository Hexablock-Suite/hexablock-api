import { receiveValueOf } from '../../../src/adapters/received.js';
import { ElapsedTime } from '../../../src/domain/progress/elapsed-time.js';
import { LevelId } from '../../../src/domain/progress/level-id.js';
import {
  LevelResult,
  type LevelResultReceiver,
} from '../../../src/domain/progress/level-result.js';
import { Moves } from '../../../src/domain/progress/moves.js';
import { Stars } from '../../../src/domain/progress/stars.js';
import { levelResultOf } from '../../support/level-results.js';
import { valueOf } from '../../support/result.js';

const VALID = { levelId: 'fit-01', stars: 3, moves: 12, elapsedMs: 45_000 };

// A receiver of the border that keeps the four values as text and numbers.
class RecordingLevelResultReceiver implements LevelResultReceiver {
  readonly received: (string | number)[][] = [];

  receive(levelId: LevelId, stars: Stars, moves: Moves, elapsedTime: ElapsedTime): void {
    this.received.push([
      receiveValueOf(levelId),
      receiveValueOf(stars),
      receiveValueOf(moves),
      receiveValueOf(elapsedTime),
    ]);
  }
}

describe('LevelResult', () => {
  // #95: the factory takes the four value objects, and the values leave only
  // through one delivery to a receiver of the border.
  it('should_deliver_the_four_value_objects_when_the_factory_took_them', () => {
    const result = LevelResult.of(
      valueOf(LevelId.of('fit-01')),
      valueOf(Stars.of(3)),
      valueOf(Moves.of(12)),
      valueOf(ElapsedTime.ofMs(45_000)),
    );
    const receiver = new RecordingLevelResultReceiver();

    result.deliverTo(receiver);

    expect(receiver.received).toEqual([['fit-01', 3, 12, 45_000]]);
  });

  it('should_have_no_public_field_when_the_values_leave_through_a_delivery', () => {
    const result = levelResultOf(VALID);
    const receiver = new RecordingLevelResultReceiver();

    // @ts-expect-error -- #95 makes the level id private.
    void result.levelId;
    // @ts-expect-error -- #95 makes the stars private.
    void result.stars;
    // @ts-expect-error -- #95 makes the moves private.
    void result.moves;
    // @ts-expect-error -- #95 makes the time private.
    void result.elapsedTime;
    // The delivery returns nothing: the receiver holds the values.
    expect(result.deliverTo(receiver)).toBeUndefined();
    expect(receiver.received).toHaveLength(1);
  });

  it('should_tell_if_two_results_are_of_the_same_level_when_their_level_ids_are_compared', () => {
    const result = levelResultOf(VALID);
    const retry = levelResultOf({ levelId: 'fit-01', stars: 1, moves: 30, elapsedMs: 90_000 });
    const next = levelResultOf({ ...VALID, levelId: 'fit-02' });

    expect(result.isForSameLevelAs(retry)).toBe(true);
    expect(retry.isForSameLevelAs(result)).toBe(true);
    expect(result.isForSameLevelAs(next)).toBe(false);
    expect(next.isForSameLevelAs(result)).toBe(false);
  });

  // DS-4: more stars first, then fewer moves, then less time. Each row is one
  // step of the order. The better result loses on every later field. This
  // test is the one place that pins each step of the order of a result.
  it.each([
    // More stars wins over more moves and more time.
    [
      { stars: 3, moves: 25, elapsedMs: 90_000 },
      { stars: 2, moves: 10, elapsedMs: 30_000 },
    ],
    // On equal stars, fewer moves wins over more time.
    [
      { stars: 2, moves: 12, elapsedMs: 90_000 },
      { stars: 2, moves: 13, elapsedMs: 30_000 },
    ],
    // On equal stars and moves, less time wins.
    [
      { stars: 2, moves: 12, elapsedMs: 44_999 },
      { stars: 2, moves: 12, elapsedMs: 45_000 },
    ],
  ])(
    'should_rank_more_stars_then_fewer_moves_then_less_time_first_when_results_are_compared',
    (better, worse) => {
      const first = levelResultOf({ ...VALID, ...better });
      const second = levelResultOf({ ...VALID, ...worse });

      expect(first.isBetterThan(second)).toBe(true);
      expect(second.isBetterThan(first)).toBe(false);
    },
  );

  it('should_not_rank_either_result_first_when_stars_moves_and_time_are_equal', () => {
    const first = levelResultOf(VALID);
    const second = levelResultOf(VALID);

    expect(first.isBetterThan(second)).toBe(false);
    expect(second.isBetterThan(first)).toBe(false);
  });
});

describe('LevelResult equals', () => {
  it('should_be_equal_when_two_results_hold_the_same_fields', () => {
    const result = levelResultOf(VALID);
    const twin = levelResultOf({ ...VALID });

    expect(twin).not.toBe(result);
    expect(result.equals(twin)).toBe(true);
    expect(twin.equals(result)).toBe(true);
  });

  it.each([{ levelId: 'fit-02' }, { stars: 2 }, { moves: 13 }, { elapsedMs: 45_001 }])(
    'should_not_be_equal_when_one_field_of_the_two_results_differs',
    (change) => {
      const result = levelResultOf(VALID);
      const other = levelResultOf({ ...VALID, ...change });

      expect(result.equals(other)).toBe(false);
      expect(other.equals(result)).toBe(false);
    },
  );
});
