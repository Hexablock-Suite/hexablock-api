import type { Clock } from '../../src/application/ports/clock.js';
import { FixedClock } from './fixed-clock.js';
import { syncInstantOf } from './sync-instants.js';

const SET = syncInstantOf(new Date('2026-10-24T12:00:00.000Z'));

describe('FixedClock', () => {
  it('should_return_the_set_instant_when_now_is_read', () => {
    const clock: Clock = new FixedClock(SET);

    expect(clock.now()).toEqual(SET);
  });

  it('should_return_a_later_instant_when_clock_is_advanced', () => {
    const clock = new FixedClock(SET);

    clock.advanceBy(1_500);

    expect(clock.now()).toEqual(syncInstantOf(new Date('2026-10-24T12:00:01.500Z')));
  });
});
