import { Logger as NestBuiltInLogger, type LoggerService } from '@nestjs/common';
import { NestLogger } from '../../../src/infrastructure/logging/nest-logger.js';

type LogCall = (message: unknown, ...rest: unknown[]) => void;

// Records each call of the Nest logger, so a test reads the text that the adapter wrote.
function recordingNestLogger() {
  return {
    log: vi.fn<LogCall>(),
    warn: vi.fn<LogCall>(),
    error: vi.fn<LogCall>(),
  } satisfies LoggerService;
}

// NestLogger implements the Logger port of src/application (decision 10 of
// docs/architecture/classes.md). It writes the text of each entry.
describe('NestLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_write_name_and_success_at_log_level_when_entry_is_a_success', () => {
    const nest = recordingNestLogger();

    new NestLogger(nest).log({ useCase: 'Echo', outcome: 'success' });

    expect(nest.log).toHaveBeenCalledExactlyOnceWith('useCase=Echo outcome=success');
    expect(nest.warn).not.toHaveBeenCalled();
    expect(nest.error).not.toHaveBeenCalled();
  });

  it('should_write_name_failure_and_kind_at_warn_level_when_entry_is_a_failure', () => {
    const nest = recordingNestLogger();

    new NestLogger(nest).log({ useCase: 'Echo', outcome: 'failure', kind: 'progress-not-found' });

    expect(nest.warn).toHaveBeenCalledExactlyOnceWith(
      'useCase=Echo outcome=failure kind=progress-not-found',
    );
    expect(nest.log).not.toHaveBeenCalled();
    expect(nest.error).not.toHaveBeenCalled();
  });

  it('should_write_name_error_and_stack_at_error_level_when_entry_is_an_error', () => {
    const nest = recordingNestLogger();

    new NestLogger(nest).log({
      useCase: 'Echo',
      outcome: 'error',
      message: 'database is down',
      stack: 'Error: database is down\n    at test',
    });

    expect(nest.error).toHaveBeenCalledExactlyOnceWith(
      'useCase=Echo outcome=error error=database is down',
      'Error: database is down\n    at test',
    );
    expect(nest.log).not.toHaveBeenCalled();
    expect(nest.warn).not.toHaveBeenCalled();
  });

  it('should_write_error_without_stack_when_entry_has_no_stack', () => {
    const nest = recordingNestLogger();

    new NestLogger(nest).log({
      useCase: 'Echo',
      outcome: 'error',
      message: 'database is down',
      stack: undefined,
    });

    expect(nest.error).toHaveBeenCalledExactlyOnceWith(
      'useCase=Echo outcome=error error=database is down',
      undefined,
    );
  });

  // The default Nest logger keeps the context of the aspect, as before the move.
  it('should_write_through_nest_logger_with_logging_aspect_context_when_no_logger_is_given', () => {
    const log = vi.spyOn(NestBuiltInLogger.prototype, 'log').mockImplementation(() => undefined);

    new NestLogger().log({ useCase: 'Echo', outcome: 'success' });

    expect(log).toHaveBeenCalledExactlyOnceWith('useCase=Echo outcome=success');
    expect(log.mock.contexts[0]).toMatchObject({ context: 'LoggingAspect' });
  });
});
