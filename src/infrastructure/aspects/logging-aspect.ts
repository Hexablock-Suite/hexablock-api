import { Logger, type LoggerService } from '@nestjs/common';
import type { UseCase } from '../../application/use-case.js';
import type { Result } from '../../domain/shared/result.js';
import { UseCaseAspect } from './use-case-aspect.js';

// Logs each call of the inner use case: its name, the outcome and the error.
// It sits in layer 4 and calls the Nest logger directly, so it needs no
// Logger port (decision 10 of docs/architecture/classes.md, open in Q12).
// A success logs at log level. A failed Result logs at warn level. A thrown
// error logs at error level, and the aspect throws it again.
export class LoggingAspect<TRequest, TValue, TError> extends UseCaseAspect<
  TRequest,
  Result<TValue, TError>
> {
  constructor(
    inner: UseCase<TRequest, Result<TValue, TError>>,
    private readonly name: string,
    private readonly logger: LoggerService = new Logger(LoggingAspect.name),
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
      this.logger.error(`useCase=${this.name} outcome=error error=${message}`, stack);
      throw error;
    }
    if (result.ok) {
      this.logger.log(`useCase=${this.name} outcome=success`);
    } else {
      this.logger.warn(
        `useCase=${this.name} outcome=failure error=${JSON.stringify(result.error, bigintAsText)}`,
      );
    }
    return result;
  }
}

// JSON.stringify throws on a bigint. This replacer writes it as text.
function bigintAsText(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}
