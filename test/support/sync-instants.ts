import { SyncInstant } from '../../src/domain/progress/sync-instant.js';
import { valueOf } from './result.js';

// Builds the SyncInstant of a Date, as SystemClock builds it from the
// milliseconds of the system clock. A test names an instant as a Date,
// because the rows and the JSON bodies keep it as a timestamp and as text.
export function syncInstantOf(at: Date): SyncInstant {
  return valueOf(SyncInstant.of(at.getTime()));
}
