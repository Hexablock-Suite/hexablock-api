// Port. The aspects write one entry per use case call here. The entry holds
// data, not text: the adapter in src/infrastructure writes the text
// (decision 10 of docs/architecture/classes.md). A failure gives only its
// kind, because the rest of a failure can hold values that the client sent.
// A thrown error gives its name, its code when the code is a string, and the
// frames of its stack. It never gives its message: a message is free text,
// and it can quote a value that the client sent. The frames exclude the
// first line of the stack, because that line repeats the message.
export type UseCaseLogEntry =
  | { readonly useCase: string; readonly outcome: 'success' }
  | { readonly useCase: string; readonly outcome: 'failure'; readonly kind: string }
  | {
      readonly useCase: string;
      readonly outcome: 'error';
      readonly name: string;
      readonly code: string | undefined;
      readonly frames: string | undefined;
    };

export interface Logger {
  log(entry: UseCaseLogEntry): void;
}

// Nest injection token for the Logger port. It is a plain symbol, so the
// application stays free of framework imports.
export const LOGGER = Symbol('Logger');
