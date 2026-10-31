import { SystemClock } from '../../src/infrastructure/clock/system-clock.js';
import { describeClockContract } from './clock.contract.js';
import { FixedClock } from './fixed-clock.js';

describeClockContract('FixedClock', () => new FixedClock(new Date('2026-10-24T12:00:00.000Z')));
describeClockContract('SystemClock', () => new SystemClock());
