import type { Result } from '../../domain/shared/result.js';
import type { Logger } from '../ports/logger.js';
import type { UseCase } from '../use-case.js';
import { UseCaseAspect } from './use-case-aspect.js';

// Logs each call of the inner use case: its name and the outcome. It writes
// a typed entry to the Logger port, and the adapter writes the text
// (decision 10 of docs/architecture/classes.md, Q12). A failed Result logs
// only its kind, so a value that the client sent never reaches the log. A
// thrown error logs its name, its string code and its stack frames, never
// its message, and the aspect throws it again. A logger that throws does not
// change the outcome of the use case.
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
      // A getter of the thrown value can throw while the aspect reads it.
      // So the aspect builds the entry inside safely(), and the caller still
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

// The name, the string code and the stack frames of a thrown value. It never
// reads the message into the entry. A value that is not an Error gives only
// its type, because its text can quote a value that the client sent.
function describe(error: unknown): {
  name: string;
  code: string | undefined;
  frames: string | undefined;
} {
  if (!(error instanceof Error)) {
    return { name: typeof error, code: undefined, frames: undefined };
  }
  const code: unknown = (error as { code?: unknown }).code;
  return {
    name: typeof error.name === 'string' ? error.name : 'Error',
    code: typeof code === 'string' ? code : undefined,
    frames: framesOf(error),
  };
}

// The stack without its header. V8 writes the header as the text of
// Error.prototype.toString(): the name, then the message, and the message
// can span lines. A stack that does not start with that exact header can
// hold the message anywhere, so the function then gives no frames.
function framesOf(error: Error): string | undefined {
  const stack: unknown = error.stack;
  const header = `${Error.prototype.toString.call(error)}\n`;
  if (typeof stack !== 'string' || !stack.startsWith(header)) {
    return undefined;
  }
  const frames = stack.slice(header.length);
  return frames === '' ? undefined : frames;
}
