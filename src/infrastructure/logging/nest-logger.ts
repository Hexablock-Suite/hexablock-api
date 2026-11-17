import { Logger as NestBuiltInLogger, type LoggerService } from '@nestjs/common';
import type { Logger, UseCaseLogEntry } from '../../application/ports/logger.js';

// Adapter for the Logger port. It writes each entry as one line through the
// Nest logger: a success at log level, a failure with its kind at warn
// level, and an error at error level with its name, its code when it has
// one, and its stack frames. The entry of an error holds no message. An
// unavailable level goes at warn level with its key and its reason (#147).
// The key quotes each value as JSON, so a row value cannot break the line.
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
      case 'unavailable-level':
        this.nest.warn(
          `${head} gameId=${JSON.stringify(entry.gameId)} levelId=${JSON.stringify(entry.levelId)} reason=${entry.reason}`,
        );
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
