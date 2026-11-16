import type { SyncInstant } from '../../domain/progress/sync-instant.js';

// Port. The application reads the current instant only here. The domain
// never imports this port: it takes the instant as a parameter. The port
// carries a domain type, so the instant is a SyncInstant, not a Date.
export interface Clock {
  now(): SyncInstant;
}

// Nest injection token for the Clock port. It is a plain symbol, so the
// application stays free of framework imports.
export const CLOCK = Symbol('Clock');
