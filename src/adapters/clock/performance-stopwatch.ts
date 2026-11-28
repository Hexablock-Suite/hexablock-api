import type { Stopwatch } from '../../application/ports/stopwatch.js';

// Production adapter for the Stopwatch port (#181). It reads the monotonic
// clock of the global performance object, so a change of the system time
// does not change a duration. performance is a global of JavaScript, not an
// import, so the folder keeps every Node built-in out.
export class PerformanceStopwatch implements Stopwatch {
  readMs(): number {
    return performance.now();
  }
}
