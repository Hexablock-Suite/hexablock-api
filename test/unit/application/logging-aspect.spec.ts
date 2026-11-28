import { levelJson } from '../../support/level-format.js';
import { a5FailingFitJson } from '../../support/level-update.js';
import { AuthenticateTokenTestApi } from '../../support/testing-api/authenticate-token.test-api.js';
import { GetLevelsTestApi } from '../../support/testing-api/get-levels.test-api.js';
import {
  type EchoAnswer,
  LoggingAspectTestApi,
} from '../../support/testing-api/logging-aspect.test-api.js';
import { LoginTestApi } from '../../support/testing-api/login.test-api.js';
import { RegisterTestApi } from '../../support/testing-api/register.test-api.js';
import { SyncProgressTestApi } from '../../support/testing-api/sync-progress.test-api.js';
import { UpdateLevelsTestApi } from '../../support/testing-api/update-levels.test-api.js';

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
// The inner use case of these cases is Echo: it answers each request with
// the answer of the given step.
describe('LoggingAspect', () => {
  let logging: LoggingAspectTestApi;

  beforeEach(() => {
    logging = new LoggingAspectTestApi();
  });

  it('should_log_name_and_success_and_return_inner_result_unchanged_when_inner_use_case_succeeds', async () => {
    logging.givenTheInnerUseCaseSucceedsWith('done');

    await logging.whenCallingTheAspectWith('ping');

    logging.thenTheAspectGivesTheInnerResultUnchanged();
    logging.thenTheInnerUseCaseGot(['ping']);
    logging.thenTheLogEntriesAre([{ useCase: 'Echo', outcome: 'success', elapsedMs: 0 }]);
  });

  // #181: the aspect reads the Stopwatch port before and after the inner
  // call. The entry of the call carries the time between the two readings.
  it('should_log_the_measured_duration_in_the_success_entry_when_the_inner_use_case_succeeds', async () => {
    logging.givenTheInnerUseCaseSucceedsWith('done').givenTheInnerCallsTake([37.5]);

    await logging.whenCallingTheAspectWith('ping');

    logging.thenTheLogEntriesAre([{ useCase: 'Echo', outcome: 'success', elapsedMs: 37.5 }]);
  });

  it('should_log_the_measured_duration_in_the_failure_entry_when_the_inner_use_case_fails', async () => {
    logging
      .givenTheInnerUseCaseFailsWith({ kind: 'progress-not-found' })
      .givenTheInnerCallsTake([37.5]);

    await logging.whenCallingTheAspectWith('ping');

    logging.thenTheLogEntriesAre([
      { useCase: 'Echo', outcome: 'failure', kind: 'progress-not-found', elapsedMs: 37.5 },
    ]);
  });

  it('should_log_the_measured_duration_in_the_error_entry_when_the_inner_use_case_throws', async () => {
    const failure = new Error('database is down');
    logging.givenTheInnerUseCaseThrows(failure).givenTheInnerCallsTake([37.5]);

    await logging.whenCallingTheAspectWith('ping');

    logging.thenTheAspectRethrowsTheThrownValue();
    logging.thenTheLogEntriesAre([
      {
        useCase: 'Echo',
        outcome: 'error',
        name: 'Error',
        code: undefined,
        frames: framesOf(failure),
        elapsedMs: 37.5,
      },
    ]);
  });

  // The duration is a datum of the one entry of the call. No second entry
  // holds it, so each call still writes one entry.
  it('should_write_one_entry_with_its_own_duration_per_call_when_the_aspect_runs_two_calls', async () => {
    logging.givenTheInnerUseCaseSucceedsWith('done').givenTheInnerCallsTake([30, 12]);

    await logging.whenCallingTheAspectWith('ping');
    await logging.whenCallingTheAspectWith('pong');

    logging.thenTheLogEntriesAre([
      { useCase: 'Echo', outcome: 'success', elapsedMs: 30 },
      { useCase: 'Echo', outcome: 'success', elapsedMs: 12 },
    ]);
  });

  // An extra entry, such as a broken level row, is not a call. Only the
  // success entry of the call carries the duration.
  it('should_log_the_duration_only_in_the_success_entry_when_extra_entries_are_given', async () => {
    logging
      .givenTheInnerUseCaseSucceedsWith('fit-01')
      .givenTheInnerCallsTake([25])
      .givenAnUnavailableLevelEntryForEachLevelIdOfTheValue();

    await logging.whenCallingTheAspectWith('ping');

    logging.thenTheLogEntriesAre([
      {
        useCase: 'Echo',
        outcome: 'unavailable-level',
        gameId: 'hexa-fit',
        levelId: 'fit-01',
        reason: 'invalid-figure',
      },
      { useCase: 'Echo', outcome: 'success', elapsedMs: 25 },
    ]);
    logging.thenTheFirstEntryHasNoDuration();
  });

  // #219: a function of the composition root gives extra entries from the
  // value of a success. The aspect adds the name, and it writes them before
  // the success entry.
  it('should_log_each_extra_entry_with_the_name_and_then_success_when_extra_entries_are_given_and_the_call_succeeds', async () => {
    logging
      .givenTheInnerUseCaseSucceedsWith('fit-01,fit-02')
      .givenAnUnavailableLevelEntryForEachLevelIdOfTheValue();

    await logging.whenCallingTheAspectWith('ping');

    logging.thenTheAspectGivesTheInnerResultUnchanged();
    logging.thenTheLogEntriesAre([
      {
        useCase: 'Echo',
        outcome: 'unavailable-level',
        gameId: 'hexa-fit',
        levelId: 'fit-01',
        reason: 'invalid-figure',
      },
      {
        useCase: 'Echo',
        outcome: 'unavailable-level',
        gameId: 'hexa-fit',
        levelId: 'fit-02',
        reason: 'invalid-figure',
      },
      { useCase: 'Echo', outcome: 'success', elapsedMs: 0 },
    ]);
  });

  // The extra entries come from the value of a success only.
  it('should_ask_no_extra_entry_when_the_inner_use_case_fails', async () => {
    logging
      .givenTheInnerUseCaseFailsWith({ kind: 'progress-not-found' })
      .givenAnUnavailableLevelEntryForEachLevelIdOfTheValue();

    await logging.whenCallingTheAspectWith('ping');

    logging.thenTheAspectGivesTheInnerResultUnchanged();
    logging.thenNoExtraEntryWasAsked();
    logging.thenTheLogEntriesAre([
      { useCase: 'Echo', outcome: 'failure', kind: 'progress-not-found', elapsedMs: 0 },
    ]);
  });

  // A failed write of one extra entry stops only that write. The caller gets
  // the result, and the aspect writes the next entries.
  it('should_return_the_result_and_write_the_next_entries_when_the_logger_throws_on_an_extra_entry', async () => {
    logging
      .givenTheInnerUseCaseSucceedsWith('fit-01,fit-02')
      .givenAnUnavailableLevelEntryForEachLevelIdOfTheValue()
      .givenTheLoggerThrowsOnTheFirstWrite();

    await logging.whenCallingTheAspectWith('ping');

    logging.thenTheAspectGivesTheInnerResultUnchanged();
    logging.thenTheLogEntriesAre([
      {
        useCase: 'Echo',
        outcome: 'unavailable-level',
        gameId: 'hexa-fit',
        levelId: 'fit-02',
        reason: 'invalid-figure',
      },
      { useCase: 'Echo', outcome: 'success', elapsedMs: 0 },
    ]);
  });

  // A function of extra entries that throws does not change the result, and
  // the aspect still writes the success entry.
  it('should_return_the_result_and_log_success_when_the_extra_entries_function_throws', async () => {
    logging.givenTheInnerUseCaseSucceedsWith('done').givenTheExtraEntriesFunctionThrows();

    await logging.whenCallingTheAspectWith('ping');

    logging.thenTheAspectGivesTheInnerResultUnchanged();
    logging.thenTheLogEntriesAre([{ useCase: 'Echo', outcome: 'success', elapsedMs: 0 }]);
  });

  it('should_log_name_failure_and_kind_and_return_inner_result_unchanged_when_inner_use_case_fails', async () => {
    logging.givenTheInnerUseCaseFailsWith({ kind: 'progress-not-found' });

    await logging.whenCallingTheAspectWith('ping');

    logging.thenTheAspectGivesTheInnerResultUnchanged();
    logging.thenTheLogEntriesAre([
      { useCase: 'Echo', outcome: 'failure', kind: 'progress-not-found', elapsedMs: 0 },
    ]);
  });

  // A failure can carry a value that the client sent, such as an invalid
  // gameId. The log keeps only the kind, so that value never reaches the log.
  it('should_log_only_kind_and_no_client_value_when_failure_carries_a_client_value', async () => {
    logging.givenTheInnerUseCaseFailsWith({
      kind: 'invalid-progress',
      problems: ['gameId must be a lowercase slug, got "Hexa Lines".'],
    });

    await logging.whenCallingTheAspectWith('ping');

    logging.thenTheAspectGivesTheInnerResultUnchanged();
    logging.thenTheLogEntriesAre([
      { useCase: 'Echo', outcome: 'failure', kind: 'invalid-progress', elapsedMs: 0 },
    ]);
    logging.thenNoLogEntryHolds('Hexa Lines');
  });

  // JSON.stringify throws on a bigint. The aspect logs only the kind, so a
  // bigint in the failure never reaches the log, and the result stays unchanged.
  it('should_log_only_kind_and_return_inner_result_unchanged_when_failure_holds_bigints', async () => {
    logging.givenTheInnerUseCaseFailsWith({ kind: 'big', sizes: [1n, { inner: 2n }], count: 3 });

    await logging.whenCallingTheAspectWith('ping');

    logging.thenTheAspectGivesTheInnerResultUnchanged();
    logging.thenTheLogEntriesAre([
      { useCase: 'Echo', outcome: 'failure', kind: 'big', elapsedMs: 0 },
    ]);
  });

  it('should_log_name_error_and_rethrow_same_error_when_inner_use_case_throws', async () => {
    const failure = new Error('database is down');
    logging.givenTheInnerUseCaseThrows(failure);

    await logging.whenCallingTheAspectWith('ping');

    logging.thenTheAspectRethrowsTheThrownValue();
    logging.thenTheLogEntriesAre([
      {
        useCase: 'Echo',
        outcome: 'error',
        name: 'Error',
        code: undefined,
        frames: framesOf(failure),
        elapsedMs: 0,
      },
    ]);
  });

  // A domain error can quote a value that the client sent. The log keeps the
  // name of the error and never its message, so that value never reaches the log.
  it('should_log_no_client_value_when_the_inner_use_case_throws_an_error_that_quotes_it', async () => {
    logging.givenTheInnerUseCaseThrows(new Error('gameId "Hexa Lines" is invalid'));

    await logging.whenCallingTheAspectWith('ping');

    logging.thenTheAspectRethrowsTheThrownValue();
    logging.thenOneWriteWasTried();
    logging.thenNoLogEntryHolds('Hexa Lines');
  });

  // The first lines of a stack repeat the whole message, so a message that
  // spans lines must not leave a line of it in the frames.
  it('should_log_no_line_of_the_message_when_the_thrown_error_has_a_multi_line_message', async () => {
    logging.givenTheInnerUseCaseThrows(
      new RangeError('gameId "Hexa Lines" is invalid\nscore "Hexa Sort" is invalid'),
    );

    await logging.whenCallingTheAspectWith('ping');

    logging.thenTheAspectRethrowsTheThrownValue();
    logging.thenTheLogEntriesAre([
      {
        useCase: 'Echo',
        outcome: 'error',
        name: 'RangeError',
        code: undefined,
        frames: expect.stringMatching(/^ {4}at /),
        elapsedMs: 0,
      },
    ]);
    logging.thenNoLogEntryHolds('Hexa');
  });

  // A driver or network error gives its operational clue in a string code.
  it('should_log_name_string_code_and_stack_frames_when_the_thrown_error_has_a_string_code', async () => {
    const failure = Object.assign(new DriverError('connect to "Hexa Lines" refused'), {
      code: 'ECONNREFUSED',
    });
    logging.givenTheInnerUseCaseThrows(failure);

    await logging.whenCallingTheAspectWith('ping');

    logging.thenTheAspectRethrowsTheThrownValue();
    logging.thenTheLogEntriesAre([
      {
        useCase: 'Echo',
        outcome: 'error',
        name: 'DriverError',
        code: 'ECONNREFUSED',
        frames: framesOf(failure),
        elapsedMs: 0,
      },
    ]);
    logging.thenTheFramesOfTheErrorEntryStartWithAStackLine();
    logging.thenNoLogEntryHolds('Hexa Lines');
  });

  it('should_log_no_code_when_the_thrown_error_has_a_code_that_is_not_a_string', async () => {
    const failure = Object.assign(new Error('duplicate key "Hexa Lines"'), { code: 23505 });
    logging.givenTheInnerUseCaseThrows(failure);

    await logging.whenCallingTheAspectWith('ping');

    logging.thenTheAspectRethrowsTheThrownValue();
    logging.thenTheLogEntriesAre([
      {
        useCase: 'Echo',
        outcome: 'error',
        name: 'Error',
        code: undefined,
        frames: framesOf(failure),
        elapsedMs: 0,
      },
    ]);
  });

  // A stack that does not start with the name and the message can hold the
  // message anywhere. The aspect then logs no frames.
  it('should_log_no_frames_when_the_stack_does_not_start_with_the_name_and_the_message', async () => {
    const failure = new Error('gameId "Hexa Lines" is invalid');
    failure.stack = 'Wrapped: gameId "Hexa\nLines" is invalid\n    at somewhere (file.ts:1:1)';
    logging.givenTheInnerUseCaseThrows(failure);

    await logging.whenCallingTheAspectWith('ping');

    logging.thenTheAspectRethrowsTheThrownValue();
    logging.thenTheLogEntriesAre([
      {
        useCase: 'Echo',
        outcome: 'error',
        name: 'Error',
        code: undefined,
        frames: undefined,
        elapsedMs: 0,
      },
    ]);
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
    logging.givenTheInnerUseCaseThrows(failure);

    await logging.whenCallingTheAspectWith('ping');

    logging.thenTheAspectRethrowsTheThrownValue();
    logging.thenNoWriteWasTried();
  });

  // A message can hold a line that looks like a stack frame. The header of
  // the stack holds the whole message, so the frames leave that line out,
  // and the text that NestLogger writes never holds it.
  it('should_log_no_message_in_the_nest_text_when_the_error_quotes_a_client_value_in_a_fake_frame_line', async () => {
    logging
      .givenTheInnerUseCaseThrows(new Error('x\n    at SECRETVAL (file:1:1)'))
      .givenTheAspectWritesThroughNestLogger();

    await logging.whenCallingTheAspectWith('ping');

    logging.thenTheAspectRethrowsTheThrownValue();
    logging.thenTheNestLoggerWroteOnlyOneErrorLine();
    logging.thenNoNestLineHolds('SECRETVAL');
  });

  // V8 writes the stack text when code first reads it. A message that changes
  // after that read no longer matches the header, so the aspect logs no frames.
  it('should_log_no_frames_and_rethrow_when_the_message_changes_after_the_stack_is_read', async () => {
    const failure = new Error('orig');
    void failure.stack;
    failure.message = 'changed SECRETVAL';
    logging.givenTheInnerUseCaseThrows(failure);

    await logging.whenCallingTheAspectWith('ping');

    logging.thenTheAspectRethrowsTheThrownValue();
    logging.thenTheLogEntriesAre([
      {
        useCase: 'Echo',
        outcome: 'error',
        name: 'Error',
        code: undefined,
        frames: undefined,
        elapsedMs: 0,
      },
    ]);
    logging.thenNoLogEntryHolds('SECRETVAL');
  });

  // A logger that throws does not change the outcome of the use case.
  it.each<EchoAnswer>([{ value: 'done' }, { problem: { kind: 'progress-not-found' } }])(
    'should_return_inner_result_unchanged_when_logger_throws_on_success_or_failure',
    async (answer) => {
      logging.givenTheInnerUseCaseAnswers(answer).givenTheLoggerThrowsOnEveryWrite();

      await logging.whenCallingTheAspectWith('ping');

      logging.thenTheAspectGivesTheInnerResultUnchanged();
      logging.thenOneWriteWasTried();
    },
  );

  it('should_rethrow_inner_error_when_logger_throws_while_it_logs_that_error', async () => {
    logging
      .givenTheInnerUseCaseThrows(new Error('database is down'))
      .givenTheLoggerThrowsOnEveryWrite();

    await logging.whenCallingTheAspectWith('ping');

    logging.thenTheAspectRethrowsTheThrownValue();
    logging.thenOneWriteWasTried();
  });

  it('should_rethrow_same_non_error_object_when_logger_throws_while_it_logs_that_value', async () => {
    logging
      .givenTheInnerUseCaseThrows({ reason: 'database is down' })
      .givenTheLoggerThrowsOnEveryWrite();

    await logging.whenCallingTheAspectWith('ping');

    logging.thenTheAspectRethrowsTheThrownValue();
    logging.thenTheTriedWritesAre([
      {
        useCase: 'Echo',
        outcome: 'error',
        name: 'object',
        code: undefined,
        frames: undefined,
        elapsedMs: 0,
      },
    ]);
  });

  // A thrown value that is not an Error has no name, no code and no stack.
  // Its text can quote a client value, so the aspect logs only its type and
  // throws the same value again.
  it('should_log_only_the_type_and_rethrow_it_when_inner_use_case_throws_a_non_error', async () => {
    logging.givenTheInnerUseCaseThrows('gameId "Hexa Lines" is invalid');

    await logging.whenCallingTheAspectWith('ping');

    logging.thenTheAspectRethrowsTheThrownValue();
    logging.thenTheLogEntriesAre([
      {
        useCase: 'Echo',
        outcome: 'error',
        name: 'string',
        code: undefined,
        frames: undefined,
        elapsedMs: 0,
      },
    ]);
  });

  // String() throws a TypeError on an object without a prototype. The aspect
  // logs only the type of a non-Error, so the entry needs no text of it, and
  // the caller gets the thrown object itself.
  it('should_rethrow_same_object_when_inner_use_case_throws_an_object_without_prototype', async () => {
    logging.givenTheInnerUseCaseThrows(Object.create(null));

    await logging.whenCallingTheAspectWith('ping');

    logging.thenTheAspectRethrowsTheThrownValue();
    logging.thenTheLogEntriesAre([
      {
        useCase: 'Echo',
        outcome: 'error',
        name: 'object',
        code: undefined,
        frames: undefined,
        elapsedMs: 0,
      },
    ]);
  });

  // SyncProgressUseCase holds no logging code: the log entry comes from the aspect.
  it('should_log_sync_progress_outcome_when_aspect_wraps_use_case_without_logging_code', async () => {
    const sync = new SyncProgressTestApi().givenTheLevelStoreHolds([]);

    await sync.whenSyncingThroughTheLoggingAspect({
      gameId: 'hexa-lines',
      score: 120,
      results: [],
    });

    sync.thenTheSyncSucceeds();
    sync.thenTheLoggingAspectIsAUseCaseAspect();
    sync.thenTheLogEntriesAre([{ useCase: 'SyncProgress', outcome: 'success', elapsedMs: 0 }]);
  });

  // UpdateLevels holds no logging code, and its failure carries a kind. So
  // the aspect logs the kind of a failed update and no value of a level.
  it('should_log_invalid_levels_kind_and_no_level_value_when_aspect_wraps_update_levels_and_a_level_breaks_a_rule', async () => {
    const update = new UpdateLevelsTestApi();

    await update.whenUpdatingThroughTheLoggingAspect([a5FailingFitJson('fit-secret-07')]);

    update.thenTheUpdateFailsWithTheKind('invalid-levels');
    update.thenTheLogEntriesAre([
      { useCase: 'UpdateLevels', outcome: 'failure', kind: 'invalid-levels', elapsedMs: 0 },
    ]);
    update.thenNoLogEntryHolds('fit-secret-07');
  });

  // #180: AppModule puts LoggingAspect outside AuthorizationAspect, so the
  // log sees each rejected attempt to update the levels. The entry holds
  // the kind and no user id, and the API saves nothing.
  it('should_log_one_failure_entry_with_kind_not_a_level_editor_and_save_nothing_when_logging_aspect_wraps_authorization_aspect_and_the_account_is_not_a_level_editor', async () => {
    const update = new UpdateLevelsTestApi().givenTheLevelEditors([1]);

    await update.whenUserUpdatesThroughTheAspects(2, [levelJson('hexa-fit')]);

    update.thenTheUpdateFailsWithNotALevelEditor();
    update.thenTheLogEntriesAre([
      { useCase: 'UpdateLevels', outcome: 'failure', kind: 'not-a-level-editor', elapsedMs: 0 },
    ]);
    update.thenNoLogEntryHoldsTheIdOfUser(2);
    update.thenTheStoredLevelsAre([]);
  });

  // GetLevels has no expected failure: its error type is never, which meets
  // the kind bound of the aspect. So the aspect can wrap it too.
  it('should_log_get_levels_success_when_aspect_wraps_get_levels', async () => {
    const getLevels = new GetLevelsTestApi();

    await getLevels.whenGettingTheLevelsThroughTheLoggingAspect();

    getLevels.thenTheReadGives({ levels: [], unavailable: [] });
    getLevels.thenTheLogEntriesAre([{ useCase: 'GetLevels', outcome: 'success', elapsedMs: 0 }]);
  });

  // The three account ports bind UseCase, and each problem carries a kind
  // (#104). So the aspect wraps each port, logs the kind of a failure and
  // never logs a password or a token. Since #105 a request carries a
  // Password or a PasswordAttempt, and the aspect logs no part of a request.
  it('should_log_username_taken_kind_and_no_password_when_aspect_wraps_register_user_and_the_username_is_taken', async () => {
    const register = new RegisterTestApi().givenARegisteredUser('ada', 'correct horse');

    await register.whenRegisteringThroughTheLoggingAspect('ada', 'typed-secret-07');

    register.thenTheRegistrationFailsWithUsernameTaken();
    register.thenTheLogEntriesAre([
      { useCase: 'RegisterUser', outcome: 'failure', kind: 'username-taken', elapsedMs: 0 },
    ]);
    register.thenNoLogEntryHolds('typed-secret-07');
  });

  it('should_log_invalid_credentials_kind_and_no_password_when_aspect_wraps_login_and_the_password_is_wrong', async () => {
    const login = new LoginTestApi().givenARegisteredUser('ada', 'correct horse');

    await login.whenSigningInThroughTheLoggingAspect('ada', 'typed-secret-07');

    login.thenTheSignInFailsWithInvalidCredentials();
    login.thenTheLogEntriesAre([
      { useCase: 'Login', outcome: 'failure', kind: 'invalid-credentials', elapsedMs: 0 },
    ]);
    login.thenNoLogEntryHolds('typed-secret-07');
  });

  it('should_log_invalid_token_kind_and_no_token_when_aspect_wraps_authenticate_token_and_the_token_is_forged', async () => {
    const authenticate = new AuthenticateTokenTestApi();

    await authenticate.whenAuthenticatingThroughTheLoggingAspect('forged-token-secret-07');

    authenticate.thenTheTokenIsInvalid();
    authenticate.thenTheLogEntriesAre([
      { useCase: 'AuthenticateToken', outcome: 'failure', kind: 'invalid-token', elapsedMs: 0 },
    ]);
    authenticate.thenNoLogEntryHolds('forged-token-secret-07');
  });
});
