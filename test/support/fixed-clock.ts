import { receiveValueOf } from '../../src/adapters/received.js';
import type { Clock } from '../../src/application/ports/clock.js';
import { SyncInstant } from '../../src/domain/progress/sync-instant.js';
import { valueOf } from './result.js';

// Test double for the Clock port. It returns a set instant and moves only
// when the test advances it. It keeps the milliseconds of the instant, so
// advanceBy() can add to them.
export class FixedClock implements Clock {
  private epochMs: number;

  constructor(instant: SyncInstant) {
    this.epochMs = receiveValueOf(instant);
  }

  now(): SyncInstant {
    return valueOf(SyncInstant.of(this.epochMs));
  }

  advanceBy(milliseconds: number): void {
    this.epochMs += milliseconds;
  }
}
