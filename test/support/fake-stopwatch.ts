import type { Stopwatch } from '../../src/application/ports/stopwatch.js';

// Test double for the Stopwatch port. Its reading starts at 0 and moves only
// when the test moves it: advanceBy() moves it once, and a step moves it
// after each reading. So a test knows each duration that the aspect measures.
export class FakeStopwatch implements Stopwatch {
  private reading = 0;

  constructor(private readonly stepMs = 0) {}

  readMs(): number {
    const reading = this.reading;
    this.reading += this.stepMs;
    return reading;
  }

  advanceBy(milliseconds: number): void {
    this.reading += milliseconds;
  }
}
