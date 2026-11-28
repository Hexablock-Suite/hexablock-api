import { Logger as NestBuiltInLogger, type LoggerService } from '@nestjs/common';
import type { Logger, UseCaseLogEntry } from '../../application/ports/logger.js';

// Adapter for the Logger port. It writes each entry as one line through the
// Nest logger: a success at log level, a failure with its kind at warn
// level, and an error at error level with its name, its code when it has
// one, and its stack frames. The entry of an error holds no message. An
// unavailable level goes at warn level with its key and its reason (#147).
// The key quotes each value as JSON, so a row value cannot break the line.
// The line of a call ends with its duration in whole milliseconds (#181).
export class NestLogger implements Logger {
  constructor(private readonly nest: LoggerService = new NestBuiltInLogger('LoggingAspect')) {}

  log(entry: UseCaseLogEntry): void {
    const head = `useCase=${entry.useCase} outcome=${entry.outcome}`;
    switch (entry.outcome) {
      case 'success':
        this.nest.log(`${head}${durationOf(entry.elapsedMs)}`);
        return;
      case 'failure':
        this.nest.warn(`${head} kind=${entry.kind}${durationOf(entry.elapsedMs)}`);
        return;
      case 'unavailable-level':
        this.nest.warn(
          `${head} gameId=${JSON.stringify(entry.gameId)} levelId=${JSON.stringify(entry.levelId)} reason=${entry.reason}`,
        );
        return;
      case 'error':
        this.nest.error(
          `${head} error=${entry.name}${entry.code === undefined ? '' : ` code=${entry.code}`}${durationOf(entry.elapsedMs)}`,
          entry.frames,
        );
        return;
    }
  }
}

// The text of a duration at the end of a line, rounded to whole milliseconds.
function durationOf(elapsedMs: number): string {
  return ` elapsedMs=${Math.round(elapsedMs)}`;
}
