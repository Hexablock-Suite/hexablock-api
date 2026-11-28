import type { Stopwatch } from '../../src/application/ports/stopwatch.js';
import { FakeStopwatch } from './fake-stopwatch.js';

describe('FakeStopwatch', () => {
  it('should_return_zero_when_the_stopwatch_has_not_moved', () => {
    const stopwatch: Stopwatch = new FakeStopwatch();

    expect(stopwatch.readMs()).toBe(0);
    expect(stopwatch.readMs()).toBe(0);
  });

  it('should_return_a_later_reading_when_the_stopwatch_is_advanced', () => {
    const stopwatch = new FakeStopwatch();

    stopwatch.advanceBy(37.5);

    expect(stopwatch.readMs()).toBe(37.5);
  });

  it('should_move_by_the_step_after_each_reading_when_a_step_is_set', () => {
    const stopwatch = new FakeStopwatch(25);

    expect([stopwatch.readMs(), stopwatch.readMs(), stopwatch.readMs()]).toEqual([0, 25, 50]);
  });
});
