// Port. The aspects write one entry per use case call here. The entry holds
// data, not text: the adapter in src/infrastructure writes the text
// (decision 10 of docs/architecture/classes.md).
export type UseCaseLogEntry =
  | { readonly useCase: string; readonly outcome: 'success' }
  | { readonly useCase: string; readonly outcome: 'failure'; readonly error: unknown }
  | {
      readonly useCase: string;
      readonly outcome: 'error';
      readonly message: string;
      readonly stack: string | undefined;
    };

export interface Logger {
  log(entry: UseCaseLogEntry): void;
}

// Nest injection token for the Logger port. It is a plain symbol, so the
// application stays free of framework imports.
export const LOGGER = Symbol('Logger');
