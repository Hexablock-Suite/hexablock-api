import type { Clock } from '../../src/application/ports/clock.js';
import { SyncInstant } from '../../src/domain/progress/sync-instant.js';

// Contract of the Clock port. The test double and the production adapter
// run the same cases, so the double promises nothing that the adapter breaks.
// The port gives a SyncInstant, an immutable value object, so a caller
// cannot change a reading.
export function describeClockContract(name: string, createClock: () => Clock): void {
  describe(`Clock contract: ${name}`, () => {
    it('should_return_a_sync_instant_when_now_is_read', () => {
      const clock = createClock();

      expect(clock.now()).toBeInstanceOf(SyncInstant);
    });

    it('should_not_go_back_when_now_is_read_again', () => {
      const clock = createClock();
      const first = clock.now();

      const second = clock.now();

      expect(first.isLaterThan(second)).toBe(false);
    });
  });
}
