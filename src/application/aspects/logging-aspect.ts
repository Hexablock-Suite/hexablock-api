import type { Result } from '../../domain/shared/result.js';
import type { Logger } from '../ports/logger.js';
import type { UseCase } from '../use-case.js';
import { UseCaseAspect } from './use-case-aspect.js';

// Logs each call of the inner use case: its name, the outcome and the error.
// It writes a typed entry to the Logger port, and the adapter writes the text
// (decision 10 of docs/architecture/classes.md, Q12). A thrown error is
// logged, and the aspect throws it again. A logger that throws does not
// change the outcome of the use case.
export class LoggingAspect<TRequest, TValue, TError> extends UseCaseAspect<
  TRequest,
  Result<TValue, TError>
> {
  constructor(
    inner: UseCase<TRequest, Result<TValue, TError>>,
    private readonly name: string,
    private readonly logger: Logger,
  ) {
    super(inner);
  }

  override async execute(request: TRequest): Promise<Result<TValue, TError>> {
    let result: Result<TValue, TError>;
    try {
      result = await super.execute(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.safely(() => this.logger.log({ useCase: this.name, outcome: 'error', message, stack }));
      throw error;
    }
    if (result.ok) {
      this.safely(() => this.logger.log({ useCase: this.name, outcome: 'success' }));
    } else {
      this.safely(() =>
        this.logger.log({ useCase: this.name, outcome: 'failure', error: result.error }),
      );
    }
    return result;
  }

  // Runs one log write. A failure of the write stops here: the caller gets
  // the result or the error of the inner use case.
  private safely(write: () => void): void {
    try {
      write();
    } catch {
      // No source gives a policy for a failed log write, so the aspect drops it.
    }
  }
}
