import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DrizzleLeaderboardReader } from '../../src/adapters/persistence/drizzle-leaderboard-reader.js';
import { DrizzleLevelRepository } from '../../src/adapters/persistence/drizzle-level-repository.js';
import { DrizzleProgressRepository } from '../../src/adapters/persistence/drizzle-progress-repository.js';
import { DrizzleUserRepository } from '../../src/adapters/persistence/drizzle-user-repository.js';
import { LoggingAspect } from '../../src/application/aspects/logging-aspect.js';
import {
  GET_GLOBAL_LEADERBOARD,
  type GetGlobalLeaderboard,
} from '../../src/application/leaderboard/get-global-leaderboard.use-case.js';
import {
  GET_LEVEL_LEADERBOARD,
  type GetLevelLeaderboard,
} from '../../src/application/leaderboard/get-level-leaderboard.use-case.js';
import { GET_LEVELS, type GetLevels } from '../../src/application/levels/get-levels.use-case.js';
import {
  UPDATE_LEVELS,
  type UpdateLevels,
} from '../../src/application/levels/update-levels.use-case.js';
import { GLOBAL_BOARD_READER } from '../../src/application/ports/global-board-reader.js';
import { LEVEL_BOARD_READER } from '../../src/application/ports/level-board-reader.js';
import { LEVEL_REPOSITORY } from '../../src/application/ports/level-repository.js';
import { LOGGER } from '../../src/application/ports/logger.js';
import { STOPWATCH } from '../../src/application/ports/stopwatch.js';
import { PROGRESS_REPOSITORY } from '../../src/application/ports/progress-repository.js';
import {
  GET_PROGRESS,
  type GetProgress,
} from '../../src/application/progress/get-progress.use-case.js';
import {
  SYNC_PROGRESS,
  type SyncProgress,
} from '../../src/application/progress/sync-progress.use-case.js';
import { GameId } from '../../src/domain/progress/game-id.js';
import { LevelId } from '../../src/domain/progress/level-id.js';
import { UserId } from '../../src/domain/user/user-id.js';
import {
  AUTHENTICATE_TOKEN,
  type AuthenticateToken,
} from '../../src/application/auth/authenticate-token.use-case.js';
import { LOGIN, type Login } from '../../src/application/auth/login.use-case.js';
import { REGISTER_USER, type RegisterUser } from '../../src/application/auth/register.use-case.js';
import { PASSWORD_HASHER } from '../../src/application/ports/password-hasher.js';
import { TOKEN_ISSUER } from '../../src/application/ports/token-issuer.js';
import { USER_ID_GENERATOR } from '../../src/application/ports/user-id-generator.js';
import { USER_REPOSITORY } from '../../src/application/ports/user-repository.js';
import { AppModule } from '../../src/infrastructure/app.module.js';
import { JwtTokenIssuer } from '../../src/adapters/jwt/jwt-token-issuer.js';
import { RandomUserIdGenerator } from '../../src/adapters/crypto/random-user-id-generator.js';
import { ScryptPasswordHasher } from '../../src/adapters/crypto/scrypt-password-hasher.js';
import { NestLogger } from '../../src/adapters/logging/nest-logger.js';
import { PerformanceStopwatch } from '../../src/adapters/clock/performance-stopwatch.js';
import { InMemoryUserRepository, PrefixPasswordHasher } from '../support/auth/fakes.js';
import { loginRequest, registerRequest } from '../support/auth/requests.js';
import { FakeStopwatch } from '../support/fake-stopwatch.js';
import { stubTestEnvironment } from '../support/http/test-app.js';
import { InMemoryLevelRepository } from '../support/in-memory-level-repository.js';
import { InMemoryProgressRepository } from '../support/in-memory-progress-repository.js';
import { levelJson, levelValidators } from '../support/level-format.js';
import { brokenRow, listedJson } from '../support/level-repository.contract.js';
import { levelResultOf } from '../support/level-results.js';
import { incomingLevel } from '../support/level-update.js';
import { testUserId } from '../support/user-ids.js';
import { valueOf } from '../support/result.js';

// AppModule is the composition root: it binds each account port to one adapter.
describe('AppModule account wiring', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  // #170: LoggingAspect wraps the three account use cases, so a failed
  // sign-in leaves a log entry.
  it('should_bind_account_ports_to_their_adapters_and_wrap_the_account_use_cases_in_logging_aspect_when_app_module_compiles', async () => {
    stubTestEnvironment();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    expect(moduleRef.get(PASSWORD_HASHER)).toBeInstanceOf(ScryptPasswordHasher);
    expect(moduleRef.get(TOKEN_ISSUER)).toBeInstanceOf(JwtTokenIssuer);
    expect(moduleRef.get(USER_ID_GENERATOR)).toBeInstanceOf(RandomUserIdGenerator);
    expect(moduleRef.get(USER_REPOSITORY)).toBeInstanceOf(DrizzleUserRepository);
    expect(moduleRef.get(REGISTER_USER)).toBeInstanceOf(LoggingAspect);
    expect(moduleRef.get(LOGIN)).toBeInstanceOf(LoggingAspect);
    expect(moduleRef.get(AUTHENTICATE_TOKEN)).toBeInstanceOf(LoggingAspect);
    await moduleRef.close();
  });

  it('should_bind_progress_ports_and_wrap_both_progress_use_cases_in_logging_aspect_when_app_module_compiles', async () => {
    stubTestEnvironment();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    expect(moduleRef.get(PROGRESS_REPOSITORY)).toBeInstanceOf(DrizzleProgressRepository);
    expect(moduleRef.get(LOGGER)).toBeInstanceOf(NestLogger);
    expect(moduleRef.get(SYNC_PROGRESS)).toBeInstanceOf(LoggingAspect);
    expect(moduleRef.get(GET_PROGRESS)).toBeInstanceOf(LoggingAspect);
    await moduleRef.close();
  });

  // #181: AppModule binds the Stopwatch port to the monotonic clock of the
  // global performance object.
  it('should_bind_the_stopwatch_port_to_performance_stopwatch_when_app_module_compiles', async () => {
    stubTestEnvironment();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    expect(moduleRef.get(STOPWATCH)).toBeInstanceOf(PerformanceStopwatch);
    await moduleRef.close();
  });

  // #181: the composition root gives the Stopwatch port to each LoggingAspect.
  // The fake stopwatch moves 25 ms per reading, so each line of the five
  // ports that the other tests do not call ends with elapsedMs=25.
  it('should_end_each_line_with_the_duration_of_the_stopwatch_port_when_the_account_progress_and_update_ports_are_called', async () => {
    stubTestEnvironment();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(USER_REPOSITORY)
      .useValue(new InMemoryUserRepository())
      .overrideProvider(PASSWORD_HASHER)
      .useValue(new PrefixPasswordHasher())
      .overrideProvider(PROGRESS_REPOSITORY)
      .useValue(new InMemoryProgressRepository())
      .overrideProvider(LEVEL_REPOSITORY)
      .useValue(new InMemoryLevelRepository(levelValidators()))
      .overrideProvider(STOPWATCH)
      .useValue(new FakeStopwatch(25))
      .compile();
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    await moduleRef
      .get<RegisterUser>(REGISTER_USER)
      .execute(registerRequest('ada', 'correct horse'));
    const token = valueOf(
      await moduleRef.get<Login>(LOGIN).execute(loginRequest('ada', 'correct horse')),
    );
    const userId = valueOf(
      await moduleRef.get<AuthenticateToken>(AUTHENTICATE_TOKEN).execute(token),
    );
    await moduleRef
      .get<GetProgress>(GET_PROGRESS)
      .execute({ userId, gameId: valueOf(GameId.of('hexa-lines')) });
    await moduleRef.get<UpdateLevels>(UPDATE_LEVELS).execute({ userId, levels: [] });

    const lines = [...log.mock.calls, ...warn.mock.calls].map(([line]) => String(line));
    expect(lines.map((line) => line.split(' ')[0]).sort()).toEqual([
      'useCase=AuthenticateToken',
      'useCase=GetProgress',
      'useCase=Login',
      'useCase=RegisterUser',
      'useCase=UpdateLevels',
    ]);
    expect(lines.every((line) => line.endsWith(' elapsedMs=25'))).toBe(true);
    await moduleRef.close();
  });

  // The in-memory repository takes the place of the Drizzle one, so no
  // database is needed. The spy starts after the module is built, so it sees
  // only the line of the aspect.
  it('should_run_sync_progress_inside_logging_aspect_when_sync_progress_port_is_called', async () => {
    stubTestEnvironment();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PROGRESS_REPOSITORY)
      .useValue(new InMemoryProgressRepository())
      .overrideProvider(STOPWATCH)
      .useValue(new FakeStopwatch(25))
      .compile();
    const sync = moduleRef.get<SyncProgress>(SYNC_PROGRESS);
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    const result = await sync.execute({
      userId: valueOf(UserId.from(testUserId(1))),
      gameId: valueOf(GameId.of('hexa-lines')),
      results: [],
    });

    expect(result.ok).toBe(true);
    expect(log).toHaveBeenCalledExactlyOnceWith(
      'useCase=SyncProgress outcome=success elapsedMs=25',
    );
    await moduleRef.close();
  });

  // AppModule registers the Fit and Sort strategies once. The level store
  // and UpdateLevels share them. LoggingAspect wraps GetLevels (#219) and
  // UpdateLevels.
  it('should_bind_level_ports_and_wrap_get_levels_and_update_levels_in_logging_aspect_when_app_module_compiles', async () => {
    stubTestEnvironment();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    expect(moduleRef.get(LEVEL_REPOSITORY)).toBeInstanceOf(DrizzleLevelRepository);
    expect(moduleRef.get(GET_LEVELS)).toBeInstanceOf(LoggingAspect);
    expect(moduleRef.get(UPDATE_LEVELS)).toBeInstanceOf(LoggingAspect);
    await moduleRef.close();
  });

  // #180: UPDATE_LEVELS is LoggingAspect over AuthorizationAspect over
  // UpdateLevelsUseCase. The inner layer rejects an account outside
  // LEVEL_EDITOR_IDS before the use case saves, and the outer layer writes
  // the line of that rejected attempt. An editor passes both layers, and the
  // use case saves the level.
  it('should_log_the_rejected_attempt_and_save_only_the_level_of_the_editor_when_the_update_levels_port_is_called_by_an_account_outside_the_list_and_by_an_editor', async () => {
    stubTestEnvironment();
    vi.stubEnv('LEVEL_EDITOR_IDS', testUserId(1));
    const levels = new InMemoryLevelRepository(levelValidators());
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LEVEL_REPOSITORY)
      .useValue(levels)
      .overrideProvider(STOPWATCH)
      .useValue(new FakeStopwatch(25))
      .compile();
    const updateLevels = moduleRef.get<UpdateLevels>(UPDATE_LEVELS);
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const batch = [incomingLevel(levelJson('hexa-fit'))];

    const rejected = await updateLevels.execute({
      userId: valueOf(UserId.from(testUserId(2))),
      levels: batch,
    });
    const storedAfterRejection = await listedJson(levels);
    const accepted = await updateLevels.execute({
      userId: valueOf(UserId.from(testUserId(1))),
      levels: batch,
    });

    expect(updateLevels).toBeInstanceOf(LoggingAspect);
    expect(rejected).toEqual({ ok: false, error: { kind: 'not-a-level-editor' } });
    expect(storedAfterRejection).toEqual([]);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'useCase=UpdateLevels outcome=failure kind=not-a-level-editor elapsedMs=25',
    );
    expect(accepted).toEqual({ ok: true, value: undefined });
    expect(log).toHaveBeenCalledExactlyOnceWith(
      'useCase=UpdateLevels outcome=success elapsedMs=25',
    );
    expect(await listedJson(levels)).toEqual([levelJson('hexa-fit')]);
    await moduleRef.close();
  });

  // #193: each level use case holds one role of the LevelRepository port,
  // and AppModule gives all four the one LEVEL_REPOSITORY instance. So one
  // override of that token reaches list(), holds(), findFor() and update().
  // The spies on the logger keep the lines of the aspect out of the output.
  it('should_give_the_one_level_repository_to_the_four_level_use_cases_when_level_repository_is_overridden', async () => {
    stubTestEnvironment();
    vi.stubEnv('LEVEL_EDITOR_IDS', testUserId(1));
    const levels = new InMemoryLevelRepository(levelValidators());
    const list = vi.spyOn(levels, 'list');
    const holds = vi.spyOn(levels, 'holds');
    const findFor = vi.spyOn(levels, 'findFor');
    const update = vi.spyOn(levels, 'update');
    const empty = () => Promise.resolve([]);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LEVEL_REPOSITORY)
      .useValue(levels)
      .overrideProvider(PROGRESS_REPOSITORY)
      .useValue(new InMemoryProgressRepository())
      .overrideProvider(DrizzleLeaderboardReader)
      .useValue({ levelResults: empty, highScores: empty, standings: empty })
      .compile();
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const fit = valueOf(GameId.of('hexa-fit'));
    const level = valueOf(LevelId.of('fit-01'));
    const result = levelResultOf({ levelId: 'fit-01', stars: 1, moves: 9, elapsedMs: 30000 });

    await moduleRef.get<GetLevels>(GET_LEVELS).execute();
    await moduleRef
      .get<GetLevelLeaderboard>(GET_LEVEL_LEADERBOARD)
      .execute({ gameId: fit, levelId: level });
    await moduleRef.get<SyncProgress>(SYNC_PROGRESS).execute({
      userId: valueOf(UserId.from(testUserId(1))),
      gameId: fit,
      results: [result],
    });
    await moduleRef.get<UpdateLevels>(UPDATE_LEVELS).execute({
      userId: valueOf(UserId.from(testUserId(1))),
      levels: [incomingLevel(levelJson('hexa-sort'))],
    });

    expect(moduleRef.get(LEVEL_REPOSITORY)).toBe(levels);
    expect(list).toHaveBeenCalledOnce();
    expect(holds).toHaveBeenCalledExactlyOnceWith(fit, level);
    expect(findFor).toHaveBeenCalledExactlyOnceWith(fit, [result]);
    expect(update).toHaveBeenCalledOnce();
    await moduleRef.close();
  });

  // #219: the aspect writes the line of each broken row and then the line of
  // the call, both through NestLogger under the context LoggingAspect (#216).
  // The spies start after the module is built, so they see only these lines.
  it('should_write_the_broken_row_line_and_then_the_success_line_under_the_logging_aspect_context_when_get_levels_reads_a_broken_row', async () => {
    stubTestEnvironment();
    const levels = new InMemoryLevelRepository(levelValidators());
    levels.storeRow(brokenRow(levelJson('hexa-fit')));
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LEVEL_REPOSITORY)
      .useValue(levels)
      .overrideProvider(STOPWATCH)
      .useValue(new FakeStopwatch(25))
      .compile();
    const getLevels = moduleRef.get<GetLevels>(GET_LEVELS);
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    const result = await getLevels.execute();

    expect(result.ok).toBe(true);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'useCase=GetLevels outcome=unavailable-level gameId="hexa-fit" levelId="fit-01" reason=invalid-figure',
    );
    expect(log).toHaveBeenCalledExactlyOnceWith('useCase=GetLevels outcome=success elapsedMs=25');
    expect(warn.mock.invocationCallOrder[0]).toBeLessThan(log.mock.invocationCallOrder[0] ?? 0);
    expect(warn.mock.contexts[0]).toMatchObject({ context: 'LoggingAspect' });
    await moduleRef.close();
  });

  // #218: each board has its own reader port and its own input port. One
  // DrizzleLeaderboardReader implements both reader ports, so both tokens
  // give the same instance.
  it('should_bind_both_board_readers_to_one_drizzle_reader_and_wrap_both_leaderboard_ports_in_logging_aspect_when_app_module_compiles', async () => {
    stubTestEnvironment();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    const globalReader = moduleRef.get(GLOBAL_BOARD_READER);
    expect(globalReader).toBeInstanceOf(DrizzleLeaderboardReader);
    expect(moduleRef.get(LEVEL_BOARD_READER)).toBe(globalReader);
    expect(moduleRef.get(GET_GLOBAL_LEADERBOARD)).toBeInstanceOf(LoggingAspect);
    expect(moduleRef.get(GET_LEVEL_LEADERBOARD)).toBeInstanceOf(LoggingAspect);
    await moduleRef.close();
  });

  // The stub reader takes the place of the Drizzle one, so no database is
  // needed. The spy starts after the module is built, so it sees only the
  // line of the aspect.
  it('should_run_get_global_leaderboard_inside_logging_aspect_when_get_global_leaderboard_port_is_called', async () => {
    stubTestEnvironment();
    const empty = () => Promise.resolve([]);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DrizzleLeaderboardReader)
      .useValue({ levelResults: empty, highScores: empty, standings: empty })
      .overrideProvider(STOPWATCH)
      .useValue(new FakeStopwatch(25))
      .compile();
    const getGlobalLeaderboard = moduleRef.get<GetGlobalLeaderboard>(GET_GLOBAL_LEADERBOARD);
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    const result = await getGlobalLeaderboard.execute(valueOf(GameId.of('hexa-fit')));

    expect(result.ok).toBe(true);
    expect(log).toHaveBeenCalledExactlyOnceWith(
      'useCase=GetGlobalLeaderboard outcome=success elapsedMs=25',
    );
    await moduleRef.close();
  });

  // The empty in-memory level store holds no level, so the read fails with
  // unknown-level, and the aspect writes the failure at warn level.
  it('should_run_get_level_leaderboard_inside_logging_aspect_when_get_level_leaderboard_port_is_called', async () => {
    stubTestEnvironment();
    const empty = () => Promise.resolve([]);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DrizzleLeaderboardReader)
      .useValue({ levelResults: empty, highScores: empty, standings: empty })
      .overrideProvider(LEVEL_REPOSITORY)
      .useValue(new InMemoryLevelRepository(levelValidators()))
      .overrideProvider(STOPWATCH)
      .useValue(new FakeStopwatch(25))
      .compile();
    const getLevelLeaderboard = moduleRef.get<GetLevelLeaderboard>(GET_LEVEL_LEADERBOARD);
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const result = await getLevelLeaderboard.execute({
      gameId: valueOf(GameId.of('hexa-fit')),
      levelId: valueOf(LevelId.of('fit-01')),
    });

    expect(result).toEqual({ ok: false, error: { kind: 'unknown-level' } });
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'useCase=GetLevelLeaderboard outcome=failure kind=unknown-level elapsedMs=25',
    );
    await moduleRef.close();
  });

  it('should_refuse_to_start_when_jwt_secret_is_missing', async () => {
    stubTestEnvironment();
    vi.stubEnv('JWT_SECRET', undefined);

    await expect(Test.createTestingModule({ imports: [AppModule] }).compile()).rejects.toThrow(
      'JWT_SECRET is not set.',
    );
  });

  // #145: a wrong entry in the list of level editors stops the start, as a
  // missing JWT_SECRET does.
  it('should_refuse_to_start_when_level_editor_ids_holds_an_entry_that_is_not_a_user_id', async () => {
    stubTestEnvironment();
    vi.stubEnv('LEVEL_EDITOR_IDS', 'ada');

    await expect(Test.createTestingModule({ imports: [AppModule] }).compile()).rejects.toThrow(
      'LEVEL_EDITOR_IDS holds "ada", which is not a user id.',
    );
  });

  // #170: a wrong rate limit of sign-up and sign-in stops the start.
  it('should_refuse_to_start_when_auth_rate_limit_is_not_a_whole_number_of_1_or_more_or_off', async () => {
    stubTestEnvironment();
    vi.stubEnv('AUTH_RATE_LIMIT', 'ten');

    await expect(Test.createTestingModule({ imports: [AppModule] }).compile()).rejects.toThrow(
      'AUTH_RATE_LIMIT holds "ten", which is not a whole number of 1 or more or "off".',
    );
  });
});
