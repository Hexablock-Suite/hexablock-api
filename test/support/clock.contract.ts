import type { Clock } from '../../src/application/ports/clock.js';

// Contract of the Clock port. The test double and the production adapter
// run the same cases, so the double promises nothing that the adapter breaks.
export function describeClockContract(name: string, createClock: () => Clock): void {
  describe(`Clock contract: ${name}`, () => {
    it('should_return_a_valid_date_when_now_is_read', () => {
      const clock = createClock();

      const reading = clock.now();

      expect(reading).toBeInstanceOf(Date);
      expect(Number.isNaN(reading.getTime())).toBe(false);
    });

    it('should_keep_its_next_reading_when_caller_mutates_returned_date', () => {
      const clock = createClock();
      const first = clock.now();
      const firstEpochMs = first.getTime();

      first.setUTCFullYear(1999);

      expect(clock.now().getTime()).toBeGreaterThanOrEqual(firstEpochMs);
    });
  });
}
