import type { LoggerService } from '@nestjs/common';
import type { UseCase } from '../../../src/application/use-case.js';
import { SyncProgressUseCase } from '../../../src/application/progress/sync-progress.use-case.js';
import { err, ok, type Result } from '../../../src/domain/shared/result.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import { LoggingAspect } from '../../../src/infrastructure/aspects/logging-aspect.js';
import { UseCaseAspect } from '../../../src/infrastructure/aspects/use-case-aspect.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { InMemoryProgressRepository } from '../../support/in-memory-progress-repository.js';

type EchoResult = Result<string, { kind: string }>;
type LogCall = (message: unknown, ...rest: unknown[]) => void;

// A stand-in use case. Its execute mock answers each request with the given step.
function echo(answer: () => Promise<EchoResult>) {
  const execute = vi.fn<(request: string) => Promise<EchoResult>>(answer);
  const inner: UseCase<string, EchoResult> = { execute };
  return { inner, execute };
}

// Records each call of the logging package, so a test reads what the aspect wrote.
function recordingLogger() {
  return {
    log: vi.fn<LogCall>(),
    warn: vi.fn<LogCall>(),
    error: vi.fn<LogCall>(),
  } satisfies LoggerService;
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
    expect(logger.log).toHaveBeenCalledExactlyOnceWith('useCase=Echo outcome=success');
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('should_log_name_failure_and_error_and_return_inner_result_unchanged_when_inner_use_case_fails', async () => {
    const result: EchoResult = err({ kind: 'progress-not-found' });
    const { inner } = echo(() => Promise.resolve(result));
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger);

    const returned = await aspect.execute('ping');

    expect(returned).toBe(result);
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      'useCase=Echo outcome=failure error={"kind":"progress-not-found"}',
    );
    expect(logger.log).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  // JSON.stringify throws on a bigint. The aspect writes it as text and
  // returns the inner result unchanged.
  it('should_log_bigint_as_text_and_return_inner_result_unchanged_when_failure_holds_a_bigint', async () => {
    const result: EchoResult = err({ kind: 'big', size: 1n });
    const { inner } = echo(() => Promise.resolve(result));
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger);

    await expect(aspect.execute('ping')).resolves.toBe(result);
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      'useCase=Echo outcome=failure error={"kind":"big","size":"1"}',
    );
  });

  it('should_log_name_error_and_rethrow_same_error_when_inner_use_case_throws', async () => {
    const failure = new Error('database is down');
    const { inner } = echo(() => Promise.reject(failure));
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger);

    await expect(aspect.execute('ping')).rejects.toBe(failure);
    expect(logger.error).toHaveBeenCalledExactlyOnceWith(
      'useCase=Echo outcome=error error=database is down',
      failure.stack,
    );
    expect(logger.log).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  // A thrown value that is not an Error has no message and no stack. The
  // aspect logs its text and throws the same value again.
  it('should_log_thrown_text_without_stack_and_rethrow_it_when_inner_use_case_throws_a_non_error', async () => {
    const { inner } = echo(() => Promise.reject('database is down'));
    const logger = recordingLogger();
    const aspect = new LoggingAspect(inner, 'Echo', logger);

    await expect(aspect.execute('ping')).rejects.toBe('database is down');
    expect(logger.error).toHaveBeenCalledExactlyOnceWith(
      'useCase=Echo outcome=error error=database is down',
      undefined,
    );
    expect(logger.log).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  // SyncProgressUseCase holds no logging code: the log line comes from the aspect.
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
    expect(logger.log).toHaveBeenCalledExactlyOnceWith('useCase=SyncProgress outcome=success');
  });
});
