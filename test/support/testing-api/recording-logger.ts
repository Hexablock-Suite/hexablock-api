import type { Logger, UseCaseLogEntry } from '../../../src/application/ports/logger.js';

// Test double for the Logger port. It keeps each entry in the order of the
// writes. Only a Testing API creates it.
export class RecordingLogger implements Logger {
  readonly entries: UseCaseLogEntry[] = [];

  log(entry: UseCaseLogEntry): void {
    this.entries.push(entry);
  }
}

// Test double for the Logger port whose every write throws.
export const failingLogger: Logger = {
  log: () => {
    throw new Error('the log is full');
  },
};
