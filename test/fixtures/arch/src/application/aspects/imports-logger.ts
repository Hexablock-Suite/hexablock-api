// Right example: an aspect writes to the log port.
import type { Logger } from '../ports/logger.js';

export class LoggingAspect {
  constructor(private readonly logger: Logger) {}

  execute(): void {
    this.logger.log('done');
  }
}
