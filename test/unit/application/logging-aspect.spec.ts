import { LoggingAspect } from '../../../src/application/aspects/logging-aspect.js';
import { UseCaseAspect } from '../../../src/application/aspects/use-case-aspect.js';
import type { Logger, UseCaseLogEntry } from '../../../src/application/ports/logger.js';
import type { UseCase } from '../../../src/application/use-case.js';
import { SyncProgressUseCase } from '../../../src/application/progress/sync-progress.use-case.js';
import { err, ok, type Result } from '../../../src/domain/shared/result.js';
import { UserId } from '../../../src/domain/user/user-id.js';
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

  it('should_log_name_failure_and_error_and_return_inner_result_unchanged_when_inner_use_case_fails', async () => {
    const result: EchoResult = err({ kind: 'progress-not-found' });
    const { inner } = echo(() => Promise.resolve(result));
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger);

    const returned = await aspect.execute('ping');

    expect(returned).toBe(result);
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'Echo',
      outcome: 'failure',
      error: { kind: 'progress-not-found' },
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
      message: 'database is down',
      stack: failure.stack,
    });
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
      message: '[object Object]',
      stack: undefined,
    });
  });

  // A thrown value that is not an Error has no message and no stack. The
  // aspect logs its text and throws the same value again.
  it('should_log_thrown_text_without_stack_and_rethrow_it_when_inner_use_case_throws_a_non_error', async () => {
    const { inner } = echo(() => Promise.reject('database is down'));
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger);

    await expect(aspect.execute('ping')).rejects.toBe('database is down');
    expect(logger.log).toHaveBeenCalledExactlyOnceWith({
      useCase: 'Echo',
      outcome: 'error',
      message: 'database is down',
      stack: undefined,
    });
  });

  // String() throws a TypeError on an object without a prototype. The log
  // never changes the result, so the caller gets the thrown object itself.
  it('should_rethrow_same_object_when_inner_use_case_throws_an_object_without_prototype', async () => {
    const failure: unknown = Object.create(null);
    const { inner } = echo(() => Promise.reject(failure));
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger);

    await expect(aspect.execute('ping')).rejects.toBe(failure);
    expect(logger.log).not.toHaveBeenCalled();
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
