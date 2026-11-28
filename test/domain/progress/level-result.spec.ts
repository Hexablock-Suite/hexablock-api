import { levelResultOf } from '../../support/level-results.js';

const VALID = { levelId: 'fit-01', stars: 3, moves: 12, elapsedMs: 45_000 };

// The PlayerProgress spec pins the delivery, the level of a result and the
// order of DS-4 through the root (#255). equals() has no caller in src/, so
// no root reaches it, and this spec keeps its rule.
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
