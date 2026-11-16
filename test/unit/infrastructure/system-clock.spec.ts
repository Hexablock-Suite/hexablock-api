import { SystemClock } from '../../../src/infrastructure/clock/system-clock.js';

// #97: SystemClock builds the SyncInstant from the system clock. The factory
// returns a failed Result for a reading that is not a valid instant. That
// reading is a fault of the server, not of a request, so the adapter throws
// and the sync saves nothing (decision 11).
describe('SystemClock', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_throw_with_the_code_of_the_rule_when_the_system_clock_gives_an_invalid_instant', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Number.NaN);

    expect(() => new SystemClock().now()).toThrow(
      new Error('The system clock breaks the rule invalid-sync-instant.'),
    );
  });
});
