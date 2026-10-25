// Port. The domain and the application read the current instant only here.
export interface Clock {
  now(): Date;
}

// Nest injection token for the Clock port. It is a plain symbol, so the
// domain stays free of framework imports.
export const CLOCK = Symbol('Clock');
