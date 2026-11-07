import type { Result } from '../../domain/shared/result.js';
import type { Logger } from '../ports/logger.js';
import type { UseCase } from '../use-case.js';
import { UseCaseAspect } from './use-case-aspect.js';

// Logs each call of the inner use case: its name and the outcome. It writes
// a typed entry to the Logger port, and the adapter writes the text
// (decision 10 of docs/architecture/classes.md, Q12). A failed Result logs
// only its kind, so a value that the client sent never reaches the log. A
// thrown error logs its message and stack, and the aspect throws it again.
// A logger that throws does not change the outcome of the use case.
export class LoggingAspect<
  TRequest,
  TValue,
  TError extends { readonly kind: string },
> extends UseCaseAspect<TRequest, Result<TValue, TError>> {
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
      // String() can throw, for example on an object without a prototype.
      // So the aspect builds the text inside safely(), and the caller still
      // gets the thrown value.
      this.safely(() =>
        this.logger.log({ useCase: this.name, outcome: 'error', ...describe(error) }),
      );
      throw error;
    }
    if (result.ok) {
      this.safely(() => this.logger.log({ useCase: this.name, outcome: 'success' }));
    } else {
      this.safely(() =>
        this.logger.log({ useCase: this.name, outcome: 'failure', kind: result.error.kind }),
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

// The message and the stack of a thrown value. A value that is not an Error
// has no stack, and its message is its text.
function describe(error: unknown): { message: string; stack: string | undefined } {
  return error instanceof Error
    ? { message: error.message, stack: error.stack }
    : { message: String(error), stack: undefined };
}
