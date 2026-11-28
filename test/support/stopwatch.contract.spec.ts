import { PerformanceStopwatch } from '../../src/adapters/clock/performance-stopwatch.js';
import { FakeStopwatch } from './fake-stopwatch.js';
import { describeStopwatchContract } from './stopwatch.contract.js';

describeStopwatchContract('FakeStopwatch', () => new FakeStopwatch(25));
describeStopwatchContract('PerformanceStopwatch', () => new PerformanceStopwatch());
