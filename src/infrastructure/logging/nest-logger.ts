import { Logger as NestBuiltInLogger, type LoggerService } from '@nestjs/common';
import type { Logger, UseCaseLogEntry } from '../../application/ports/logger.js';

// Adapter for the Logger port. It writes each entry as one line through the
// Nest logger: a success at log level, a failure with its kind at warn
// level, and an error at error level with its name, its code when it has
// one, and its stack frames. The entry of an error holds no message.
export class NestLogger implements Logger {
  constructor(private readonly nest: LoggerService = new NestBuiltInLogger('LoggingAspect')) {}

  log(entry: UseCaseLogEntry): void {
    const head = `useCase=${entry.useCase} outcome=${entry.outcome}`;
    switch (entry.outcome) {
      case 'success':
        this.nest.log(head);
        return;
      case 'failure':
        this.nest.warn(`${head} kind=${entry.kind}`);
        return;
      case 'error':
        this.nest.error(
          `${head} error=${entry.name}${entry.code === undefined ? '' : ` code=${entry.code}`}`,
          entry.frames,
        );
        return;
    }
  }
}
