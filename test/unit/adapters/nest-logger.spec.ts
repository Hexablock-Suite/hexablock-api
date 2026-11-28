import { Logger as NestBuiltInLogger, type LoggerService } from '@nestjs/common';
import { NestLogger } from '../../../src/adapters/logging/nest-logger.js';

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

    new NestLogger(nest).log({ useCase: 'Echo', outcome: 'success', elapsedMs: 0 });

    expect(nest.log).toHaveBeenCalledExactlyOnceWith('useCase=Echo outcome=success elapsedMs=0');
    expect(nest.warn).not.toHaveBeenCalled();
    expect(nest.error).not.toHaveBeenCalled();
  });

  it('should_write_name_failure_and_kind_at_warn_level_when_entry_is_a_failure', () => {
    const nest = recordingNestLogger();

    new NestLogger(nest).log({
      useCase: 'Echo',
      outcome: 'failure',
      kind: 'progress-not-found',
      elapsedMs: 0,
    });

    expect(nest.warn).toHaveBeenCalledExactlyOnceWith(
      'useCase=Echo outcome=failure kind=progress-not-found elapsedMs=0',
    );
    expect(nest.log).not.toHaveBeenCalled();
    expect(nest.error).not.toHaveBeenCalled();
  });

  // #147: a stored level row that breaks a rule. The line quotes each key
  // as JSON, so a row value cannot break the line.
  it('should_write_the_key_and_the_reason_at_warn_level_when_entry_is_an_unavailable_level', () => {
    const nest = recordingNestLogger();

    new NestLogger(nest).log({
      useCase: 'GetLevels',
      outcome: 'unavailable-level',
      gameId: 'hexa-fit',
      levelId: 'fit-01\nforged',
      reason: 'invalid-section',
    });

    expect(nest.warn).toHaveBeenCalledExactlyOnceWith(
      'useCase=GetLevels outcome=unavailable-level gameId="hexa-fit" levelId="fit-01\\nforged" reason=invalid-section',
    );
    expect(nest.log).not.toHaveBeenCalled();
    expect(nest.error).not.toHaveBeenCalled();
  });

  // The entry of a thrown error holds no message, so the line holds the name
  // and the code of the error, and the frames go to the stack argument.
  it('should_write_name_code_and_frames_and_no_message_at_error_level_when_entry_is_an_error', () => {
    const nest = recordingNestLogger();

    new NestLogger(nest).log({
      useCase: 'Echo',
      outcome: 'error',
      name: 'DriverError',
      code: 'ECONNREFUSED',
      frames: '    at connect (driver.ts:1:1)',
      elapsedMs: 0,
    });

    expect(nest.error).toHaveBeenCalledExactlyOnceWith(
      'useCase=Echo outcome=error error=DriverError code=ECONNREFUSED elapsedMs=0',
      '    at connect (driver.ts:1:1)',
    );
    expect(nest.log).not.toHaveBeenCalled();
    expect(nest.warn).not.toHaveBeenCalled();
  });

  it('should_write_name_without_code_or_frames_when_entry_has_neither', () => {
    const nest = recordingNestLogger();

    new NestLogger(nest).log({
      useCase: 'Echo',
      outcome: 'error',
      name: 'string',
      code: undefined,
      frames: undefined,
      elapsedMs: 0,
    });

    expect(nest.error).toHaveBeenCalledExactlyOnceWith(
      'useCase=Echo outcome=error error=string elapsedMs=0',
      undefined,
    );
  });

  // #181: the line ends with the duration of the call in whole milliseconds.
  it('should_write_the_duration_in_whole_milliseconds_at_the_end_of_the_line_when_the_entry_carries_a_duration', () => {
    const nest = recordingNestLogger();
    const logger = new NestLogger(nest);

    logger.log({ useCase: 'Echo', outcome: 'success', elapsedMs: 41.6 });
    logger.log({
      useCase: 'Echo',
      outcome: 'failure',
      kind: 'progress-not-found',
      elapsedMs: 12.4,
    });
    logger.log({
      useCase: 'Echo',
      outcome: 'error',
      name: 'DriverError',
      code: 'ECONNREFUSED',
      frames: undefined,
      elapsedMs: 7,
    });

    expect(nest.log).toHaveBeenCalledExactlyOnceWith('useCase=Echo outcome=success elapsedMs=42');
    expect(nest.warn).toHaveBeenCalledExactlyOnceWith(
      'useCase=Echo outcome=failure kind=progress-not-found elapsedMs=12',
    );
    expect(nest.error).toHaveBeenCalledExactlyOnceWith(
      'useCase=Echo outcome=error error=DriverError code=ECONNREFUSED elapsedMs=7',
      undefined,
    );
  });

  // The default Nest logger keeps the context of the aspect, as before the move.
  it('should_write_through_nest_logger_with_logging_aspect_context_when_no_logger_is_given', () => {
    const log = vi.spyOn(NestBuiltInLogger.prototype, 'log').mockImplementation(() => undefined);

    new NestLogger().log({ useCase: 'Echo', outcome: 'success', elapsedMs: 0 });

    expect(log).toHaveBeenCalledExactlyOnceWith('useCase=Echo outcome=success elapsedMs=0');
    expect(log.mock.contexts[0]).toMatchObject({ context: 'LoggingAspect' });
  });
});
