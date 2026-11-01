import type { Clock } from '../../application/ports/clock.js';

// Production adapter for the Clock port. It is the only reader of the system clock.
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
