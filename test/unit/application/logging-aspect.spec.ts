import type { LoggerService } from '@nestjs/common';
import {
  type ExtraLogEntry,
  LoggingAspect,
} from '../../../src/application/aspects/logging-aspect.js';
import { AuthorizationAspect } from '../../../src/application/aspects/authorization-aspect.js';
import { UseCaseAspect } from '../../../src/application/aspects/use-case-aspect.js';
import {
  type AuthenticateToken,
  AuthenticateTokenUseCase,
} from '../../../src/application/auth/authenticate-token.use-case.js';
import { type Login, LoginUseCase } from '../../../src/application/auth/login.use-case.js';
import {
  type RegisterUser,
  RegisterUseCase,
} from '../../../src/application/auth/register.use-case.js';
import type { Logger, UseCaseLogEntry } from '../../../src/application/ports/logger.js';
import type { UseCase } from '../../../src/application/use-case.js';
import {
  type GetLevels,
  GetLevelsUseCase,
} from '../../../src/application/levels/get-levels.use-case.js';
import { unavailableLevelEntries } from '../../../src/application/levels/unavailable-level-entries.js';
import { UpdateLevelsUseCase } from '../../../src/application/levels/update-levels.use-case.js';
import { SyncProgressUseCase } from '../../../src/application/progress/sync-progress.use-case.js';
import { GameId } from '../../../src/domain/progress/game-id.js';
import { Score } from '../../../src/domain/progress/score.js';
import { err, ok, type Result } from '../../../src/domain/shared/result.js';
import { LevelEditors } from '../../../src/domain/user/level-editors.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import { NestLogger } from '../../../src/adapters/logging/nest-logger.js';
import {
  InMemoryUserRepository,
  PrefixPasswordHasher,
  PrefixTokenIssuer,
  SequenceUserIdGenerator,
} from '../../support/auth/fakes.js';
import { FakeStopwatch } from '../../support/fake-stopwatch.js';
import { loginRequest, registerRequest } from '../../support/auth/requests.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { heldLevels } from '../../support/held-levels.js';
import { InMemoryLevelRepository } from '../../support/in-memory-level-repository.js';
import { InMemoryProgressRepository } from '../../support/in-memory-progress-repository.js';
import { levelJson, levelValidators } from '../../support/level-format.js';
import { listedJson } from '../../support/level-repository.contract.js';
import { syncInstantOf } from '../../support/sync-instants.js';
import { a5FailingFitJson, incomingLevel } from '../../support/level-update.js';
import { testUserId } from '../../support/user-ids.js';
import { valueOf } from '../../support/result.js';

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
    const aspect = new LoggingAspect(inner, 'Echo', logger, new FakeStopwatch());

    const returned = await aspect.execute('ping');

    expect(returned).toBe(result);
    expect(execute).toHaveBeenCalledExactlyOnceWith('ping');
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'Echo',
      outcome: 'success',
      elapsedMs: 0,
    });
  });

  // #181: the aspect reads the Stopwatch port before and after the inner
  // call. The entry of the call carries the time between the two readings.
  it('should_log_the_measured_duration_in_the_success_entry_when_the_inner_use_case_succeeds', async () => {
    const stopwatch = new FakeStopwatch();
    const { inner } = echo(() => {
      stopwatch.advanceBy(37.5);
      return Promise.resolve(ok('done'));
    });
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger, stopwatch);

    await aspect.execute('ping');

    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'Echo',
      outcome: 'success',
      elapsedMs: 37.5,
    });
  });

  it('should_log_the_measured_duration_in_the_failure_entry_when_the_inner_use_case_fails', async () => {
    const stopwatch = new FakeStopwatch();
    const { inner } = echo(() => {
      stopwatch.advanceBy(37.5);
      return Promise.resolve(err({ kind: 'progress-not-found' }));
    });
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger, stopwatch);

    await aspect.execute('ping');

    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'Echo',
      outcome: 'failure',
      kind: 'progress-not-found',
      elapsedMs: 37.5,
    });
  });

  it('should_log_the_measured_duration_in_the_error_entry_when_the_inner_use_case_throws', async () => {
    const failure = new Error('database is down');
    const stopwatch = new FakeStopwatch();
    const { inner } = echo(() => {
      stopwatch.advanceBy(37.5);
      return Promise.reject(failure);
    });
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger, stopwatch);

    await expect(aspect.execute('ping')).rejects.toBe(failure);
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'Echo',
      outcome: 'error',
      name: 'Error',
      code: undefined,
      frames: framesOf(failure),
      elapsedMs: 37.5,
    });
  });

  // The duration is a datum of the one entry of the call. No second entry
  // holds it, so each call still writes one entry.
  it('should_write_one_entry_with_its_own_duration_per_call_when_the_aspect_runs_two_calls', async () => {
    const stopwatch = new FakeStopwatch();
    const durations = [30, 12];
    const { inner } = echo(() => {
      stopwatch.advanceBy(durations.shift() ?? 0);
      return Promise.resolve(ok('done'));
    });
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger, stopwatch);

    await aspect.execute('ping');
    await aspect.execute('pong');

    expect(logger.log.mock.calls).toEqual([
      [{ useCase: 'Echo', outcome: 'success', elapsedMs: 30 }],
      [{ useCase: 'Echo', outcome: 'success', elapsedMs: 12 }],
    ]);
  });

  // An extra entry, such as a broken level row, is not a call. Only the
  // success entry of the call carries the duration.
  it('should_log_the_duration_only_in_the_success_entry_when_extra_entries_are_given', async () => {
    const stopwatch = new FakeStopwatch();
    const { inner } = echo(() => {
      stopwatch.advanceBy(25);
      return Promise.resolve(ok('fit-01'));
    });
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger, stopwatch, (value: string) => [
      {
        outcome: 'unavailable-level',
        gameId: 'hexa-fit',
        levelId: value,
        reason: 'invalid-figure',
      },
    ]);

    await aspect.execute('ping');

    expect(logger.log.mock.calls).toEqual([
      [
        {
          useCase: 'Echo',
          outcome: 'unavailable-level',
          gameId: 'hexa-fit',
          levelId: 'fit-01',
          reason: 'invalid-figure',
        },
      ],
      [{ useCase: 'Echo', outcome: 'success', elapsedMs: 25 }],
    ]);
    expect(logger.log.mock.calls[0]?.[0]).not.toHaveProperty('elapsedMs');
  });

  // #219: a function of the composition root gives extra entries from the
  // value of a success. The aspect adds the name, and it writes them before
  // the success entry.
  it('should_log_each_extra_entry_with_the_name_and_then_success_when_extra_entries_are_given_and_the_call_succeeds', async () => {
    const result: EchoResult = ok('fit-01,fit-02');
    const { inner } = echo(() => Promise.resolve(result));
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger, new FakeStopwatch(), (value: string) =>
      value.split(',').map((levelId) => ({
        outcome: 'unavailable-level' as const,
        gameId: 'hexa-fit',
        levelId,
        reason: 'invalid-figure',
      })),
    );

    const returned = await aspect.execute('ping');

    expect(returned).toBe(result);
    expect(logger.log.mock.calls).toEqual([
      [
        {
          useCase: 'Echo',
          outcome: 'unavailable-level',
          gameId: 'hexa-fit',
          levelId: 'fit-01',
          reason: 'invalid-figure',
        },
      ],
      [
        {
          useCase: 'Echo',
          outcome: 'unavailable-level',
          gameId: 'hexa-fit',
          levelId: 'fit-02',
          reason: 'invalid-figure',
        },
      ],
      [{ useCase: 'Echo', outcome: 'success', elapsedMs: 0 }],
    ]);
  });

  // The extra entries come from the value of a success only.
  it('should_ask_no_extra_entry_when_the_inner_use_case_fails', async () => {
    const result: EchoResult = err({ kind: 'progress-not-found' });
    const { inner } = echo(() => Promise.resolve(result));
    const logger = recordingLogger();
    const extraEntries = vi.fn<(value: string) => readonly ExtraLogEntry[]>(() => []);
    const aspect = new LoggingAspect(inner, 'Echo', logger, new FakeStopwatch(), extraEntries);

    const returned = await aspect.execute('ping');

    expect(returned).toBe(result);
    expect(extraEntries).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'Echo',
      outcome: 'failure',
      kind: 'progress-not-found',
      elapsedMs: 0,
    });
  });

  // A failed write of one extra entry stops only that write. The caller gets
  // the result, and the aspect writes the next entries.
  it('should_return_the_result_and_write_the_next_entries_when_the_logger_throws_on_an_extra_entry', async () => {
    const result: EchoResult = ok('fit-01,fit-02');
    const { inner } = echo(() => Promise.resolve(result));
    const logger = recordingLogger();
    logger.log.mockImplementationOnce(() => {
      throw new Error('the log is full');
    });
    const aspect = new LoggingAspect(inner, 'Echo', logger, new FakeStopwatch(), (value: string) =>
      value.split(',').map((levelId) => ({
        outcome: 'unavailable-level' as const,
        gameId: 'hexa-fit',
        levelId,
        reason: 'invalid-figure',
      })),
    );

    const returned = await aspect.execute('ping');

    expect(returned).toBe(result);
    expect(logger.log.mock.calls.slice(1)).toEqual([
      [
        {
          useCase: 'Echo',
          outcome: 'unavailable-level',
          gameId: 'hexa-fit',
          levelId: 'fit-02',
          reason: 'invalid-figure',
        },
      ],
      [{ useCase: 'Echo', outcome: 'success', elapsedMs: 0 }],
    ]);
  });

  // A function of extra entries that throws does not change the result, and
  // the aspect still writes the success entry.
  it('should_return_the_result_and_log_success_when_the_extra_entries_function_throws', async () => {
    const result: EchoResult = ok('done');
    const { inner } = echo(() => Promise.resolve(result));
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger, new FakeStopwatch(), () => {
      throw new Error('no entries');
    });

    const returned = await aspect.execute('ping');

    expect(returned).toBe(result);
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'Echo',
      outcome: 'success',
      elapsedMs: 0,
    });
  });

  it('should_log_name_failure_and_kind_and_return_inner_result_unchanged_when_inner_use_case_fails', async () => {
    const result: EchoResult = err({ kind: 'progress-not-found' });
    const { inner } = echo(() => Promise.resolve(result));
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger, new FakeStopwatch());

    const returned = await aspect.execute('ping');

    expect(returned).toBe(result);
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'Echo',
      outcome: 'failure',
      kind: 'progress-not-found',
      elapsedMs: 0,
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
    const aspect = new LoggingAspect(inner, 'Echo', logger, new FakeStopwatch());

    await expect(aspect.execute('ping')).resolves.toBe(result);
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'Echo',
      outcome: 'failure',
      kind: 'invalid-progress',
      elapsedMs: 0,
    });
    expect(JSON.stringify(logger.log.mock.calls)).not.toContain('Hexa Lines');
  });

  // JSON.stringify throws on a bigint. The aspect logs only the kind, so a
  // bigint in the failure never reaches the log, and the result stays unchanged.
  it('should_log_only_kind_and_return_inner_result_unchanged_when_failure_holds_bigints', async () => {
    const result = err({ kind: 'big', sizes: [1n, { inner: 2n }], count: 3 });
    const { inner } = echo(() => Promise.resolve(result));
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger, new FakeStopwatch());

    await expect(aspect.execute('ping')).resolves.toBe(result);
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'Echo',
      outcome: 'failure',
      kind: 'big',
      elapsedMs: 0,
    });
  });

  it('should_log_name_error_and_rethrow_same_error_when_inner_use_case_throws', async () => {
    const failure = new Error('database is down');
    const { inner } = echo(() => Promise.reject(failure));
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger, new FakeStopwatch());

    await expect(aspect.execute('ping')).rejects.toBe(failure);
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'Echo',
      outcome: 'error',
      name: 'Error',
      code: undefined,
      frames: framesOf(failure),
      elapsedMs: 0,
    });
  });

  // A domain error can quote a value that the client sent. The log keeps the
  // name of the error and never its message, so that value never reaches the log.
  it('should_log_no_client_value_when_the_inner_use_case_throws_an_error_that_quotes_it', async () => {
    const failure = new Error('gameId "Hexa Lines" is invalid');
    const { inner } = echo(() => Promise.reject(failure));
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger, new FakeStopwatch());

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
    const aspect = new LoggingAspect(inner, 'Echo', logger, new FakeStopwatch());

    await expect(aspect.execute('ping')).rejects.toBe(failure);
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'Echo',
      outcome: 'error',
      name: 'RangeError',
      code: undefined,
      frames: expect.stringMatching(/^ {4}at /),
      elapsedMs: 0,
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
    const aspect = new LoggingAspect(inner, 'Echo', logger, new FakeStopwatch());

    await expect(aspect.execute('ping')).rejects.toBe(failure);
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'Echo',
      outcome: 'error',
      name: 'DriverError',
      code: 'ECONNREFUSED',
      frames: framesOf(failure),
      elapsedMs: 0,
    });
    expect(framesOf(failure)).toMatch(/^ {4}at /);
    expect(JSON.stringify(logger.log.mock.calls)).not.toContain('Hexa Lines');
  });

  it('should_log_no_code_when_the_thrown_error_has_a_code_that_is_not_a_string', async () => {
    const failure = Object.assign(new Error('duplicate key "Hexa Lines"'), { code: 23505 });
    const { inner } = echo(() => Promise.reject(failure));
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger, new FakeStopwatch());

    await expect(aspect.execute('ping')).rejects.toBe(failure);
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'Echo',
      outcome: 'error',
      name: 'Error',
      code: undefined,
      frames: framesOf(failure),
      elapsedMs: 0,
    });
  });

  // A stack that does not start with the name and the message can hold the
  // message anywhere. The aspect then logs no frames.
  it('should_log_no_frames_when_the_stack_does_not_start_with_the_name_and_the_message', async () => {
    const failure = new Error('gameId "Hexa Lines" is invalid');
    failure.stack = 'Wrapped: gameId "Hexa\nLines" is invalid\n    at somewhere (file.ts:1:1)';
    const { inner } = echo(() => Promise.reject(failure));
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger, new FakeStopwatch());

    await expect(aspect.execute('ping')).rejects.toBe(failure);
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'Echo',
      outcome: 'error',
      name: 'Error',
      code: undefined,
      frames: undefined,
      elapsedMs: 0,
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
    const aspect = new LoggingAspect(inner, 'Echo', logger, new FakeStopwatch());

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
    const aspect = new LoggingAspect(inner, 'Echo', new NestLogger(nest), new FakeStopwatch());

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
    const aspect = new LoggingAspect(inner, 'Echo', logger, new FakeStopwatch());

    await expect(aspect.execute('ping')).rejects.toBe(failure);
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'Echo',
      outcome: 'error',
      name: 'Error',
      code: undefined,
      frames: undefined,
      elapsedMs: 0,
    });
    expect(JSON.stringify(logger.log.mock.calls)).not.toContain('SECRETVAL');
  });

  // A logger that throws does not change the outcome of the use case.
  it.each<EchoResult>([ok('done'), err({ kind: 'progress-not-found' })])(
    'should_return_inner_result_unchanged_when_logger_throws_on_success_or_failure',
    async (result) => {
      const { inner } = echo(() => Promise.resolve(result));
      const logger = recordingLogger();
      logger.log.mockImplementation(() => {
        throw new Error('log sink is full');
      });
      const aspect = new LoggingAspect(inner, 'Echo', logger, new FakeStopwatch());

      await expect(aspect.execute('ping')).resolves.toBe(result);
      expect(logger.log).toHaveBeenCalledOnce();
    },
  );

  it('should_rethrow_inner_error_when_logger_throws_while_it_logs_that_error', async () => {
    const failure = new Error('database is down');
    const { inner } = echo(() => Promise.reject(failure));
    const logger = recordingLogger();
    logger.log.mockImplementation(() => {
      throw new Error('log sink is full');
    });
    const aspect = new LoggingAspect(inner, 'Echo', logger, new FakeStopwatch());

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
    const aspect = new LoggingAspect(inner, 'Echo', logger, new FakeStopwatch());

    await expect(aspect.execute('ping')).rejects.toBe(failure);
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'Echo',
      outcome: 'error',
      name: 'object',
      code: undefined,
      frames: undefined,
      elapsedMs: 0,
    });
  });

  // A thrown value that is not an Error has no name, no code and no stack.
  // Its text can quote a client value, so the aspect logs only its type and
  // throws the same value again.
  it('should_log_only_the_type_and_rethrow_it_when_inner_use_case_throws_a_non_error', async () => {
    const { inner } = echo(() => Promise.reject('gameId "Hexa Lines" is invalid'));
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger, new FakeStopwatch());

    await expect(aspect.execute('ping')).rejects.toBe('gameId "Hexa Lines" is invalid');
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'Echo',
      outcome: 'error',
      name: 'string',
      code: undefined,
      frames: undefined,
      elapsedMs: 0,
    });
  });

  // String() throws a TypeError on an object without a prototype. The aspect
  // logs only the type of a non-Error, so the entry needs no text of it, and
  // the caller gets the thrown object itself.
  it('should_rethrow_same_object_when_inner_use_case_throws_an_object_without_prototype', async () => {
    const failure: unknown = Object.create(null);
    const { inner } = echo(() => Promise.reject(failure));
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger, new FakeStopwatch());

    await expect(aspect.execute('ping')).rejects.toBe(failure);
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'Echo',
      outcome: 'error',
      name: 'object',
      code: undefined,
      frames: undefined,
      elapsedMs: 0,
    });
  });

  // SyncProgressUseCase holds no logging code: the log entry comes from the aspect.
  it('should_log_sync_progress_outcome_when_aspect_wraps_use_case_without_logging_code', async () => {
    const logger = recordingLogger();
    const sync = new SyncProgressUseCase(
      new InMemoryProgressRepository(),
      heldLevels([]),
      new FixedClock(syncInstantOf(new Date('2026-11-06T10:00:00.000Z'))),
    );
    const aspect = new LoggingAspect(sync, 'SyncProgress', logger, new FakeStopwatch());

    const result = await aspect.execute({
      userId: valueOf(UserId.from(testUserId(1))),
      gameId: valueOf(GameId.of('hexa-lines')),
      score: valueOf(Score.of(120)),
      results: [],
    });

    expect(result.ok).toBe(true);
    expect(aspect).toBeInstanceOf(UseCaseAspect);
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'SyncProgress',
      outcome: 'success',
      elapsedMs: 0,
    });
  });

  // UpdateLevels holds no logging code, and its failure carries a kind. So
  // the aspect logs the kind of a failed update and no value of a level.
  it('should_log_invalid_levels_kind_and_no_level_value_when_aspect_wraps_update_levels_and_a_level_breaks_a_rule', async () => {
    const logger = recordingLogger();
    const levels = new InMemoryLevelRepository(levelValidators());
    const aspect = new LoggingAspect(
      new UpdateLevelsUseCase(levels, levelValidators()),
      'UpdateLevels',
      logger,
      new FakeStopwatch(),
    );

    const result = await aspect.execute({
      userId: valueOf(UserId.from(testUserId(1))),
      levels: [incomingLevel(a5FailingFitJson('fit-secret-07'))],
    });

    expect(result.ok).toBe(false);
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'UpdateLevels',
      outcome: 'failure',
      kind: 'invalid-levels',
      elapsedMs: 0,
    });
    expect(JSON.stringify(logger.log.mock.calls)).not.toContain('fit-secret-07');
  });

  // #180: AppModule puts LoggingAspect outside AuthorizationAspect, so the
  // log sees each rejected attempt to update the levels. The entry holds
  // the kind and no user id, and the API saves nothing.
  it('should_log_one_failure_entry_with_kind_not_a_level_editor_and_save_nothing_when_logging_aspect_wraps_authorization_aspect_and_the_account_is_not_a_level_editor', async () => {
    const logger = recordingLogger();
    const levels = new InMemoryLevelRepository(levelValidators());
    const editor = valueOf(UserId.from(testUserId(1)));
    const other = valueOf(UserId.from(testUserId(2)));
    const aspect = new LoggingAspect(
      new AuthorizationAspect(
        new UpdateLevelsUseCase(levels, levelValidators()),
        LevelEditors.of([editor]),
      ),
      'UpdateLevels',
      logger,
      new FakeStopwatch(),
    );

    const result = await aspect.execute({
      userId: other,
      levels: [incomingLevel(levelJson('hexa-fit'))],
    });

    expect(result).toEqual({ ok: false, error: { kind: 'not-a-level-editor' } });
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'UpdateLevels',
      outcome: 'failure',
      kind: 'not-a-level-editor',
      elapsedMs: 0,
    });
    expect(JSON.stringify(logger.log.mock.calls)).not.toContain(testUserId(2));
    expect(await listedJson(levels)).toEqual([]);
  });

  // GetLevels has no expected failure: its error type is never, which meets
  // the kind bound of the aspect. So the aspect can wrap it too.
  it('should_log_get_levels_success_when_aspect_wraps_get_levels', async () => {
    const logger = recordingLogger();
    const getLevels: GetLevels = new GetLevelsUseCase(
      new InMemoryLevelRepository(levelValidators()),
    );
    const aspect = new LoggingAspect(
      getLevels,
      'GetLevels',
      logger,
      new FakeStopwatch(),
      unavailableLevelEntries,
    );

    const result = await aspect.execute();

    expect(result).toEqual({ ok: true, value: { levels: [], unavailable: [] } });
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'GetLevels',
      outcome: 'success',
      elapsedMs: 0,
    });
  });

  // The three account ports bind UseCase, and each problem carries a kind
  // (#104). So the aspect wraps each port, logs the kind of a failure and
  // never logs a password or a token. Since #105 a request carries a
  // Password or a PasswordAttempt, and the aspect logs no part of a request.
  it('should_log_username_taken_kind_and_no_password_when_aspect_wraps_register_user_and_the_username_is_taken', async () => {
    const logger = recordingLogger();
    const register: RegisterUser = new RegisterUseCase(
      new InMemoryUserRepository(),
      new PrefixPasswordHasher(),
      new SequenceUserIdGenerator(),
    );
    await register.execute(registerRequest('ada', 'correct horse'));
    const aspect = new LoggingAspect(register, 'RegisterUser', logger, new FakeStopwatch());

    const result = await aspect.execute(registerRequest('ada', 'typed-secret-07'));

    expect(result).toEqual({ ok: false, error: { kind: 'username-taken' } });
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'RegisterUser',
      outcome: 'failure',
      kind: 'username-taken',
      elapsedMs: 0,
    });
    expect(JSON.stringify(logger.log.mock.calls)).not.toContain('typed-secret-07');
  });

  it('should_log_invalid_credentials_kind_and_no_password_when_aspect_wraps_login_and_the_password_is_wrong', async () => {
    const logger = recordingLogger();
    const users = new InMemoryUserRepository();
    const hasher = new PrefixPasswordHasher();
    await new RegisterUseCase(users, hasher, new SequenceUserIdGenerator()).execute(
      registerRequest('ada', 'correct horse'),
    );
    const login: Login = new LoginUseCase(users, hasher, new PrefixTokenIssuer());
    const aspect = new LoggingAspect(login, 'Login', logger, new FakeStopwatch());

    const result = await aspect.execute(loginRequest('ada', 'typed-secret-07'));

    expect(result).toEqual({ ok: false, error: { kind: 'invalid-credentials' } });
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'Login',
      outcome: 'failure',
      kind: 'invalid-credentials',
      elapsedMs: 0,
    });
    expect(JSON.stringify(logger.log.mock.calls)).not.toContain('typed-secret-07');
  });

  it('should_log_invalid_token_kind_and_no_token_when_aspect_wraps_authenticate_token_and_the_token_is_forged', async () => {
    const logger = recordingLogger();
    const authenticate: AuthenticateToken = new AuthenticateTokenUseCase(
      new PrefixTokenIssuer(),
      new InMemoryUserRepository(),
    );
    const aspect = new LoggingAspect(
      authenticate,
      'AuthenticateToken',
      logger,
      new FakeStopwatch(),
    );

    const result = await aspect.execute('forged-token-secret-07');

    expect(result).toEqual({ ok: false, error: { kind: 'invalid-token' } });
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'AuthenticateToken',
      outcome: 'failure',
      kind: 'invalid-token',
      elapsedMs: 0,
    });
    expect(JSON.stringify(logger.log.mock.calls)).not.toContain('forged-token-secret-07');
  });
});
