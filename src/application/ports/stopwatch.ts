// Port. The aspects read the duration of a use case call here (#181). A
// reading is a count of milliseconds on a monotonic clock. Only the
// difference of two readings has a meaning: it is the time between them. It
// is not the Clock port: Clock gives a SyncInstant, the instant of a sync,
// and a duration is another meaning of time.
export interface Stopwatch {
  readMs(): number;
}

// Nest injection token for the Stopwatch port. It is a plain symbol, so the
// application stays free of framework imports.
export const STOPWATCH = Symbol('Stopwatch');
