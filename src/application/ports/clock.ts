// Port. The application reads the current instant only here. The domain
// never imports this port: it takes the instant as a parameter.
export interface Clock {
  now(): Date;
}

// Nest injection token for the Clock port. It is a plain symbol, so the
// application stays free of framework imports.
export const CLOCK = Symbol('Clock');
