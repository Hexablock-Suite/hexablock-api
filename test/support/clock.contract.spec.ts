import { SystemClock } from '../../src/adapters/clock/system-clock.js';
import { describeClockContract } from './clock.contract.js';
import { FixedClock } from './fixed-clock.js';
import { syncInstantOf } from './sync-instants.js';

describeClockContract(
  'FixedClock',
  () => new FixedClock(syncInstantOf(new Date('2026-10-24T12:00:00.000Z'))),
);
describeClockContract('SystemClock', () => new SystemClock());
