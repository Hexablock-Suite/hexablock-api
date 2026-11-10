import { Moves } from '../../../src/domain/progress/moves.js';
import { ProgressError } from '../../../src/domain/progress/progress-error.js';

// The moves that a player uses in one level. Fewer moves is better (DS-4).
describe('Moves', () => {
  it('should_reject_the_value_when_it_is_negative_or_not_a_safe_integer', () => {
    for (const bad of [
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      2 ** 53,
      -(2 ** 53),
    ]) {
      expect(() => Moves.of(bad)).toThrow(ProgressError);
    }
    expect(() => Moves.of(-1)).toThrow('moves must be a non-negative integer, got -1.');
    expect(() => Moves.of('3' as unknown as number)).toThrow(
      'moves must be a non-negative integer, got 3.',
    );
  });

  it('should_be_equal_when_two_values_hold_the_same_count', () => {
    const value = Moves.of(12);
    const twin = Moves.of(12);
    const other = Moves.of(13);

    expect(twin).not.toBe(value);
    expect(value.equals(twin)).toBe(true);
    expect(twin.equals(value)).toBe(true);
    expect(value.equals(other)).toBe(false);
    expect(other.equals(value)).toBe(false);
    expect(Moves.of(-0).equals(Moves.of(0))).toBe(true);
  });

  // An equal count is not fewer, so a tie goes on to the time.
  it('should_tell_which_count_has_fewer_moves_when_two_counts_are_compared', () => {
    const better = Moves.of(12);
    const worse = Moves.of(13);

    expect(better.isFewerThan(worse)).toBe(true);
    expect(worse.isFewerThan(better)).toBe(false);
    expect(better.isFewerThan(Moves.of(12))).toBe(false);
  });
});
