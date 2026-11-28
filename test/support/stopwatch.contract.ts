import type { Stopwatch } from '../../src/application/ports/stopwatch.js';

// Contract of the Stopwatch port. The test double and the production adapter
// run the same cases, so the double promises nothing that the adapter breaks.
// Only the difference of two readings has a meaning, so the contract checks
// that a reading is a finite number and never goes back.
export function describeStopwatchContract(name: string, createStopwatch: () => Stopwatch): void {
  describe(`Stopwatch contract: ${name}`, () => {
    it('should_return_a_finite_number_when_the_stopwatch_is_read', () => {
      const stopwatch = createStopwatch();

      expect(Number.isFinite(stopwatch.readMs())).toBe(true);
    });

    it('should_not_go_back_when_the_stopwatch_is_read_again', () => {
      const stopwatch = createStopwatch();
      const first = stopwatch.readMs();

      const second = stopwatch.readMs();

      expect(second).toBeGreaterThanOrEqual(first);
    });
  });
}
