import type { Clock } from '../../application/ports/clock.js';
import { SyncInstant } from '../../domain/progress/sync-instant.js';

// Production adapter for the Clock port. It is the only reader of the system
// clock. It builds the SyncInstant from the milliseconds since the epoch. A
// reading that is not a valid instant is a fault of the server, so the
// adapter throws (decision 11).
export class SystemClock implements Clock {
  now(): SyncInstant {
    const instant = SyncInstant.of(Date.now());
    if (!instant.ok) {
      throw new Error(`The system clock breaks the rule ${instant.error}.`);
    }
    return instant.value;
  }
}
