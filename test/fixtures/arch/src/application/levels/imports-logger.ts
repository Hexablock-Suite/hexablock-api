// Wrong example: a use case writes to the log port. Only an aspect may.
import type { Logger } from '../ports/logger.js';

export class LoggingUseCase {
  constructor(private readonly logger: Logger) {}

  execute(): void {
    this.logger.log('done');
  }
}
