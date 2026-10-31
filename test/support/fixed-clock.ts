import type { Clock } from '../../src/application/ports/clock.js';

// Test double for the Clock port. It returns a set instant and moves only
// when the test advances it.
export class FixedClock implements Clock {
  private epochMs: number;

  constructor(instant: Date) {
    this.epochMs = instant.getTime();
  }

  now(): Date {
    return new Date(this.epochMs);
  }

  advanceBy(milliseconds: number): void {
    this.epochMs += milliseconds;
  }
}
