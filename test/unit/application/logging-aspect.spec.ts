import type { LoggerService } from '@nestjs/common';
import { LoggingAspect } from '../../../src/application/aspects/logging-aspect.js';
import { UseCaseAspect } from '../../../src/application/aspects/use-case-aspect.js';
import type { Logger, UseCaseLogEntry } from '../../../src/application/ports/logger.js';
import type { UseCase } from '../../../src/application/use-case.js';
import { SyncProgressUseCase } from '../../../src/application/progress/sync-progress.use-case.js';
import { err, ok, type Result } from '../../../src/domain/shared/result.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import { NestLogger } from '../../../src/infrastructure/logging/nest-logger.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { InMemoryProgressRepository } from '../../support/in-memory-progress-repository.js';

type EchoResult = Result<string, { kind: string }>;

// A stand-in use case. Its execute mock answers each request with the given step.
function echo(answer: () => Promise<EchoResult>) {
  const execute = vi.fn<(request: string) => Promise<EchoResult>>(answer);
  const inner: UseCase<string, EchoResult> = { execute };
  return { inner, execute };
}

// Records each entry that the aspect writes to the Logger port.
function recordingLogger() {
  return { log: vi.fn<(entry: UseCaseLogEntry) => void>() } satisfies Logger;
}

// Records each call of the Nest logger, so a test reads the text that NestLogger wrote.
function recordingNestLogger() {
  type LogCall = (message: unknown, ...rest: unknown[]) => void;
  return {
    log: vi.fn<LogCall>(),
    warn: vi.fn<LogCall>(),
    error: vi.fn<LogCall>(),
  } satisfies LoggerService;
}

// An error class with its own name, as a database driver throws.
class DriverError extends Error {
  override name = 'DriverError';
}

// The stack of an error with a one-line message, without its first line.
function framesOf(error: Error): string {
  const stack = error.stack ?? '';
  return stack.slice(stack.indexOf('\n') + 1);
}

// LoggingAspect wraps any use case (§3.5, decision 10 of docs/architecture/classes.md).
describe('LoggingAspect', () => {
  it('should_log_name_and_success_and_return_inner_result_unchanged_when_inner_use_case_succeeds', async () => {
    const result: EchoResult = ok('done');
    const { inner, execute } = echo(() => Promise.resolve(result));
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger);

    const returned = await aspect.execute('ping');

    expect(returned).toBe(result);
    expect(execute).toHaveBeenCalledExactlyOnceWith('ping');
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({ useCase: 'Echo', outcome: 'success' });
  });

  it('should_log_name_failure_and_kind_and_return_inner_result_unchanged_when_inner_use_case_fails', async () => {
    const result: EchoResult = err({ kind: 'progress-not-found' });
    const { inner } = echo(() => Promise.resolve(result));
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger);

    const returned = await aspect.execute('ping');

    expect(returned).toBe(result);
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'Echo',
      outcome: 'failure',
      kind: 'progress-not-found',
    });
  });

  // A failure can carry a value that the client sent, such as an invalid
  // gameId. The log keeps only the kind, so that value never reaches the log.
  it('should_log_only_kind_and_no_client_value_when_failure_carries_a_client_value', async () => {
    const result = err({
      kind: 'invalid-progress',
      problems: ['gameId must be a lowercase slug, got "Hexa Lines".'],
    });
    const { inner } = echo(() => Promise.resolve(result));
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger);

    await expect(aspect.execute('ping')).resolves.toBe(result);
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'Echo',
      outcome: 'failure',
      kind: 'invalid-progress',
    });
    expect(JSON.stringify(logger.log.mock.calls)).not.toContain('Hexa Lines');
  });

  // JSON.stringify throws on a bigint. The aspect logs only the kind, so a
  // bigint in the failure never reaches the log, and the result stays unchanged.
  it('should_log_only_kind_and_return_inner_result_unchanged_when_failure_holds_bigints', async () => {
    const result = err({ kind: 'big', sizes: [1n, { inner: 2n }], count: 3 });
    const { inner } = echo(() => Promise.resolve(result));
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger);

    await expect(aspect.execute('ping')).resolves.toBe(result);
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'Echo',
      outcome: 'failure',
      kind: 'big',
    });
  });

  it('should_log_name_error_and_rethrow_same_error_when_inner_use_case_throws', async () => {
    const failure = new Error('database is down');
    const { inner } = echo(() => Promise.reject(failure));
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger);

    await expect(aspect.execute('ping')).rejects.toBe(failure);
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'Echo',
      outcome: 'error',
      name: 'Error',
      code: undefined,
      frames: framesOf(failure),
    });
  });

  // A domain error can quote a value that the client sent. The log keeps the
  // name of the error and never its message, so that value never reaches the log.
  it('should_log_no_client_value_when_the_inner_use_case_throws_an_error_that_quotes_it', async () => {
    const failure = new Error('gameId "Hexa Lines" is invalid');
    const { inner } = echo(() => Promise.reject(failure));
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger);

    await expect(aspect.execute('ping')).rejects.toBe(failure);
    expect(logger.log).toHaveBeenCalledOnce();
    expect(JSON.stringify(logger.log.mock.calls)).not.toContain('Hexa Lines');
  });

  // The first lines of a stack repeat the whole message, so a message that
  // spans lines must not leave a line of it in the frames.
  it('should_log_no_line_of_the_message_when_the_thrown_error_has_a_multi_line_message', async () => {
    const failure = new RangeError('gameId "Hexa Lines" is invalid\nscore "Hexa Sort" is invalid');
    const { inner } = echo(() => Promise.reject(failure));
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger);

    await expect(aspect.execute('ping')).rejects.toBe(failure);
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'Echo',
      outcome: 'error',
      name: 'RangeError',
      code: undefined,
      frames: expect.stringMatching(/^ {4}at /),
    });
    expect(JSON.stringify(logger.log.mock.calls)).not.toContain('Hexa');
  });

  // A driver or network error gives its operational clue in a string code.
  it('should_log_name_string_code_and_stack_frames_when_the_thrown_error_has_a_string_code', async () => {
    const failure = Object.assign(new DriverError('connect to "Hexa Lines" refused'), {
      code: 'ECONNREFUSED',
    });
    const { inner } = echo(() => Promise.reject(failure));
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger);

    await expect(aspect.execute('ping')).rejects.toBe(failure);
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'Echo',
      outcome: 'error',
      name: 'DriverError',
      code: 'ECONNREFUSED',
      frames: framesOf(failure),
    });
    expect(framesOf(failure)).toMatch(/^ {4}at /);
    expect(JSON.stringify(logger.log.mock.calls)).not.toContain('Hexa Lines');
  });

  it('should_log_no_code_when_the_thrown_error_has_a_code_that_is_not_a_string', async () => {
    const failure = Object.assign(new Error('duplicate key "Hexa Lines"'), { code: 23505 });
    const { inner } = echo(() => Promise.reject(failure));
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger);

    await expect(aspect.execute('ping')).rejects.toBe(failure);
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'Echo',
      outcome: 'error',
      name: 'Error',
      code: undefined,
      frames: framesOf(failure),
    });
  });

  // A stack that does not start with the name and the message can hold the
  // message anywhere. The aspect then logs no frames.
  it('should_log_no_frames_when_the_stack_does_not_start_with_the_name_and_the_message', async () => {
    const failure = new Error('gameId "Hexa Lines" is invalid');
    failure.stack = 'Wrapped: gameId "Hexa\nLines" is invalid\n    at somewhere (file.ts:1:1)';
    const { inner } = echo(() => Promise.reject(failure));
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger);

    await expect(aspect.execute('ping')).rejects.toBe(failure);
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'Echo',
      outcome: 'error',
      name: 'Error',
      code: undefined,
      frames: undefined,
    });
  });

  // The aspect builds the entry inside safely(). A stack that throws when
  // the aspect reads it stops the log entry, not the error of the caller.
  it('should_rethrow_same_error_without_a_log_entry_when_reading_the_stack_throws', async () => {
    const failure = new Error('database is down');
    Object.defineProperty(failure, 'stack', {
      get() {
        throw new Error('stack is unreadable');
      },
    });
    const { inner } = echo(() => Promise.reject(failure));
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger);

    await expect(aspect.execute('ping')).rejects.toBe(failure);
    expect(logger.log).not.toHaveBeenCalled();
  });

  // A message can hold a line that looks like a stack frame. The header of
  // the stack holds the whole message, so the frames leave that line out,
  // and the text that NestLogger writes never holds it.
  it('should_log_no_message_in_the_nest_text_when_the_error_quotes_a_client_value_in_a_fake_frame_line', async () => {
    const failure = new Error('x\n    at SECRETVAL (file:1:1)');
    const { inner } = echo(() => Promise.reject(failure));
    const nest = recordingNestLogger();
    const aspect = new LoggingAspect(inner, 'Echo', new NestLogger(nest));

    await expect(aspect.execute('ping')).rejects.toBe(failure);
    expect(nest.error).toHaveBeenCalledOnce();
    expect(nest.log).not.toHaveBeenCalled();
    expect(nest.warn).not.toHaveBeenCalled();
    expect(
      JSON.stringify([nest.log.mock.calls, nest.warn.mock.calls, nest.error.mock.calls]),
    ).not.toContain('SECRETVAL');
  });

  // V8 writes the stack text when code first reads it. A message that changes
  // after that read no longer matches the header, so the aspect logs no frames.
  it('should_log_no_frames_and_rethrow_when_the_message_changes_after_the_stack_is_read', async () => {
    const failure = new Error('orig');
    void failure.stack;
    failure.message = 'changed SECRETVAL';
    const { inner } = echo(() => Promise.reject(failure));
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger);

    await expect(aspect.execute('ping')).rejects.toBe(failure);
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'Echo',
      outcome: 'error',
      name: 'Error',
      code: undefined,
      frames: undefined,
    });
    expect(JSON.stringify(logger.log.mock.calls)).not.toContain('SECRETVAL');
  });

  // A logger that throws does not change the outcome of the use case.
  it('should_return_inner_result_unchanged_when_logger_throws_on_success_or_failure', async () => {
    for (const result of [ok('done'), err({ kind: 'progress-not-found' })] as EchoResult[]) {
      const { inner } = echo(() => Promise.resolve(result));
      const logger = recordingLogger();
      logger.log.mockImplementation(() => {
        throw new Error('log sink is full');
      });
      const aspect = new LoggingAspect(inner, 'Echo', logger);

      await expect(aspect.execute('ping')).resolves.toBe(result);
      expect(logger.log).toHaveBeenCalledOnce();
    }
  });

  it('should_rethrow_inner_error_when_logger_throws_while_it_logs_that_error', async () => {
    const failure = new Error('database is down');
    const { inner } = echo(() => Promise.reject(failure));
    const logger = recordingLogger();
    logger.log.mockImplementation(() => {
      throw new Error('log sink is full');
    });
    const aspect = new LoggingAspect(inner, 'Echo', logger);

    await expect(aspect.execute('ping')).rejects.toBe(failure);
    expect(logger.log).toHaveBeenCalledOnce();
  });

  it('should_rethrow_same_non_error_object_when_logger_throws_while_it_logs_that_value', async () => {
    const failure = { reason: 'database is down' };
    const { inner } = echo(() => Promise.reject(failure));
    const logger = recordingLogger();
    logger.log.mockImplementation(() => {
      throw new Error('log sink is full');
    });
    const aspect = new LoggingAspect(inner, 'Echo', logger);

    await expect(aspect.execute('ping')).rejects.toBe(failure);
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'Echo',
      outcome: 'error',
      name: 'object',
      code: undefined,
      frames: undefined,
    });
  });

  // A thrown value that is not an Error has no name, no code and no stack.
  // Its text can quote a client value, so the aspect logs only its type and
  // throws the same value again.
  it('should_log_only_the_type_and_rethrow_it_when_inner_use_case_throws_a_non_error', async () => {
    const { inner } = echo(() => Promise.reject('gameId "Hexa Lines" is invalid'));
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger);

    await expect(aspect.execute('ping')).rejects.toBe('gameId "Hexa Lines" is invalid');
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'Echo',
      outcome: 'error',
      name: 'string',
      code: undefined,
      frames: undefined,
    });
  });

  // String() throws a TypeError on an object without a prototype. The aspect
  // logs only the type of a non-Error, so the entry needs no text of it, and
  // the caller gets the thrown object itself.
  it('should_rethrow_same_object_when_inner_use_case_throws_an_object_without_prototype', async () => {
    const failure: unknown = Object.create(null);
    const { inner } = echo(() => Promise.reject(failure));
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger);

    await expect(aspect.execute('ping')).rejects.toBe(failure);
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'Echo',
      outcome: 'error',
      name: 'object',
      code: undefined,
      frames: undefined,
    });
  });

  // SyncProgressUseCase holds no logging code: the log entry comes from the aspect.
  it('should_log_sync_progress_outcome_when_aspect_wraps_use_case_without_logging_code', async () => {
    const logger = recordingLogger();
    const sync = new SyncProgressUseCase(
      new InMemoryProgressRepository(),
      new FixedClock(new Date('2026-11-06T10:00:00.000Z')),
    );
    const aspect = new LoggingAspect(sync, 'SyncProgress', logger);

    const result = await aspect.execute({
      userId: UserId.from('user-1'),
      gameId: 'hexa-lines',
      score: 120,
      results: [],
    });

    expect(result.ok).toBe(true);
    expect(aspect).toBeInstanceOf(UseCaseAspect);
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'SyncProgress',
      outcome: 'success',
    });
  });
});
