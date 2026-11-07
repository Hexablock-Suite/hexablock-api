import { LevelResult } from '../../../src/domain/progress/level-result.js';
import { ProgressError } from '../../../src/domain/progress/progress-error.js';

const VALID = { levelId: 'fit-01', stars: 3, moves: 12, elapsedMs: 45_000 };

describe('LevelResult', () => {
  it('should_keep_every_field_when_values_are_valid', () => {
    const result = LevelResult.of(VALID);

    expect({
      levelId: result.levelId,
      stars: result.stars,
      moves: result.moves,
      elapsedMs: result.elapsedMs,
    }).toEqual(VALID);
  });

  it('should_reject_level_result_when_level_id_is_missing_or_blank', () => {
    for (const levelId of [undefined, '', '  ']) {
      expect(() => LevelResult.of({ ...VALID, levelId: levelId as unknown as string })).toThrow(
        ProgressError,
      );
    }
  });

  it('should_reject_level_result_when_a_count_is_negative_or_not_an_integer', () => {
    for (const field of ['stars', 'moves', 'elapsedMs'] as const) {
      for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() => LevelResult.of({ ...VALID, [field]: bad })).toThrow(ProgressError);
      }
    }
  });

  it('should_reject_level_result_when_a_count_is_negative_infinity_or_an_unsafe_integer', () => {
    for (const field of ['stars', 'moves', 'elapsedMs'] as const) {
      for (const bad of [Number.NEGATIVE_INFINITY, 2 ** 53, -(2 ** 53)]) {
        expect(() => LevelResult.of({ ...VALID, [field]: bad })).toThrow(ProgressError);
      }
    }
  });

  // DS-4: more stars first, then fewer moves, then less time.
  it('should_rank_more_stars_then_fewer_moves_then_less_time_first_when_results_are_compared', () => {
    const pairs = [
      [
        { stars: 3, moves: 25, elapsedMs: 90_000 },
        { stars: 2, moves: 10, elapsedMs: 30_000 },
      ],
      [
        { stars: 2, moves: 12, elapsedMs: 90_000 },
        { stars: 2, moves: 13, elapsedMs: 30_000 },
      ],
      [
        { stars: 2, moves: 12, elapsedMs: 44_999 },
        { stars: 2, moves: 12, elapsedMs: 45_000 },
      ],
    ];

    for (const [better, worse] of pairs) {
      const first = LevelResult.of({ ...VALID, ...better });
      const second = LevelResult.of({ ...VALID, ...worse });
      expect(first.isBetterThan(second)).toBe(true);
      expect(second.isBetterThan(first)).toBe(false);
    }
  });

  it('should_not_rank_either_result_first_when_stars_moves_and_time_are_equal', () => {
    const first = LevelResult.of(VALID);
    const second = LevelResult.of(VALID);

    expect(first.isBetterThan(second)).toBe(false);
    expect(second.isBetterThan(first)).toBe(false);
  });
});
