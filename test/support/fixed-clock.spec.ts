import type { Clock } from '../../src/application/ports/clock.js';
import { FixedClock } from './fixed-clock.js';

describe('FixedClock', () => {
  it('should_return_the_set_instant_when_now_is_read', () => {
    const clock: Clock = new FixedClock(new Date('2026-10-24T12:00:00.000Z'));

    expect(clock.now().toISOString()).toBe('2026-10-24T12:00:00.000Z');
  });

  it('should_return_a_later_instant_when_clock_is_advanced', () => {
    const clock = new FixedClock(new Date('2026-10-24T12:00:00.000Z'));

    clock.advanceBy(1_500);

    expect(clock.now().toISOString()).toBe('2026-10-24T12:00:01.500Z');
  });

  it('should_keep_its_instant_when_caller_mutates_returned_date', () => {
    const clock = new FixedClock(new Date('2026-10-24T12:00:00.000Z'));

    clock.now().setUTCFullYear(1999);

    expect(clock.now().toISOString()).toBe('2026-10-24T12:00:00.000Z');
  });
});
