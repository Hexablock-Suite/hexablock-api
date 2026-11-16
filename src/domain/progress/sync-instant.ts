import { err, ok, type Result } from '../shared/result.js';
import type { ValueReceiver } from '../shared/value-receiver.js';

// The code of the broken rule. The border writes the message (decision 11).
export type SyncInstantProblem = 'invalid-sync-instant';

// The largest distance from the epoch that a JavaScript Date holds, in
// milliseconds. The border turns each instant into a Date, so an instant
// stays inside this range.
const DATE_LIMIT_MS = 8_640_000_000_000_000;

// Value object for the instant of a sync (classes.md decision 3). It is the
// one time concept of the progress: PlayerProgress keeps the instant of its
// last sync as updatedAt. The domain holds no Date: an instant is a whole
// number of milliseconds since the Unix epoch, inside the range of a Date.
export class SyncInstant {
  private constructor(private readonly epochMs: number) {}

  static of(epochMs: number): Result<SyncInstant, SyncInstantProblem> {
    return Number.isInteger(epochMs) && Math.abs(epochMs) <= DATE_LIMIT_MS
      ? ok(new SyncInstant(epochMs))
      : err('invalid-sync-instant');
  }

  // Delivers the milliseconds to a receiver of the border. No operation
  // returns them.
  deliverTo(receiver: ValueReceiver<number>): void {
    receiver.receive(this.epochMs);
  }

  equals(other: SyncInstant): boolean {
    return this.epochMs === other.epochMs;
  }

  // An equal instant is not later, so the caller keeps the instant it has.
  isLaterThan(other: SyncInstant): boolean {
    return this.epochMs > other.epochMs;
  }
}
