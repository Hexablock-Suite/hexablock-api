import { PerformanceStopwatch } from '../../../src/adapters/clock/performance-stopwatch.js';

// #181: PerformanceStopwatch reads the monotonic clock of the global
// performance object. It imports no Node built-in (rule R-system-adapters-built-ins).
describe('PerformanceStopwatch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_return_the_reading_of_performance_now_when_the_stopwatch_is_read', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1234.5);

    expect(new PerformanceStopwatch().readMs()).toBe(1234.5);
    expect(now).toHaveBeenCalledOnce();
  });
});
