import { LevelResult } from '../../../src/domain/progress/level-result.js';
import { ProgressError } from '../../../src/domain/progress/progress-error.js';

const VALID = { levelId: 'fit-01', stars: 3, moves: 12, elapsedMs: 45_000 };

describe('LevelResult', () => {
  // The checks run in the order of the fields: the level id, the stars, the
  // moves, the time. The first broken rule gives the message.
  it('should_name_the_first_broken_field_when_several_fields_break_their_rules', () => {
    const broken = { levelId: ' ', stars: -1, moves: -2, elapsedMs: -3 };

    for (const [values, message] of [
      [broken, 'levelId must be a non-blank string.'],
      [{ ...broken, levelId: 'fit-01' }, 'stars must be a non-negative integer, got -1.'],
      [{ ...VALID, moves: -2, elapsedMs: -3 }, 'moves must be a non-negative integer, got -2.'],
      [{ ...VALID, elapsedMs: -3 }, 'elapsedMs must be a non-negative integer, got -3.'],
    ] as const) {
      expect(() => LevelResult.of(values)).toThrow(message);
    }
  });

  it('should_tell_if_two_results_are_of_the_same_level_when_their_level_ids_are_compared', () => {
    const result = LevelResult.of(VALID);
    const retry = LevelResult.of({ levelId: 'fit-01', stars: 1, moves: 30, elapsedMs: 90_000 });
    const next = LevelResult.of({ ...VALID, levelId: 'fit-02' });

    expect(result.isForSameLevelAs(retry)).toBe(true);
    expect(retry.isForSameLevelAs(result)).toBe(true);
    expect(result.isForSameLevelAs(next)).toBe(false);
    expect(next.isForSameLevelAs(result)).toBe(false);
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

describe('LevelResult equals', () => {
  it('should_be_equal_when_two_results_hold_the_same_fields', () => {
    const result = LevelResult.of(VALID);
    const twin = LevelResult.of({ ...VALID });

    expect(twin).not.toBe(result);
    expect(result.equals(twin)).toBe(true);
    expect(twin.equals(result)).toBe(true);
    for (const change of [
      { levelId: 'fit-02' },
      { stars: 2 },
      { moves: 13 },
      { elapsedMs: 45_001 },
    ]) {
      const other = LevelResult.of({ ...VALID, ...change });

      expect(result.equals(other)).toBe(false);
      expect(other.equals(result)).toBe(false);
    }
  });
});
