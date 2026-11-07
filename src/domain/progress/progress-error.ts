// Domain error. A progress value breaks one of its rules.
export class ProgressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProgressError';
  }
}
