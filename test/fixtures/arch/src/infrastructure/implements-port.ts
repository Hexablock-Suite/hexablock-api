// Wrong example: a file of the infrastructure implements a port.
import type { Clock } from '../application/ports/clock.js';

export class FixedClock implements Clock {
  now(): number {
    return 0;
  }
}
