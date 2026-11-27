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
import { UPDATE_LEVELS } from '../../src/application/levels/update-levels.use-case.js';
import { GLOBAL_BOARD_READER } from '../../src/application/ports/global-board-reader.js';
import { LEVEL_BOARD_READER } from '../../src/application/ports/level-board-reader.js';
import { LEVEL_REPOSITORY } from '../../src/application/ports/level-repository.js';
import { LOGGER } from '../../src/application/ports/logger.js';
import { PROGRESS_REPOSITORY } from '../../src/application/ports/progress-repository.js';
import {
  GET_PROGRESS,
  GetProgressUseCase,
} from '../../src/application/progress/get-progress.use-case.js';
import {
  SYNC_PROGRESS,
  type SyncProgress,
} from '../../src/application/progress/sync-progress.use-case.js';
import { GameId } from '../../src/domain/progress/game-id.js';
import { LevelId } from '../../src/domain/progress/level-id.js';
import { UserId } from '../../src/domain/user/user-id.js';
import { LOGIN, LoginUseCase } from '../../src/application/auth/login.use-case.js';
import { REGISTER_USER, RegisterUseCase } from '../../src/application/auth/register.use-case.js';
import { PASSWORD_HASHER } from '../../src/application/ports/password-hasher.js';
import { TOKEN_ISSUER } from '../../src/application/ports/token-issuer.js';
import { USER_ID_GENERATOR } from '../../src/application/ports/user-id-generator.js';
import { USER_REPOSITORY } from '../../src/application/ports/user-repository.js';
import { AppModule } from '../../src/infrastructure/app.module.js';
import { JwtTokenIssuer } from '../../src/adapters/jwt/jwt-token-issuer.js';
import { RandomUserIdGenerator } from '../../src/adapters/crypto/random-user-id-generator.js';
import { ScryptPasswordHasher } from '../../src/adapters/crypto/scrypt-password-hasher.js';
import { NestLogger } from '../../src/adapters/logging/nest-logger.js';
import { stubTestEnvironment } from '../support/http/test-app.js';
import { InMemoryLevelRepository } from '../support/in-memory-level-repository.js';
import { InMemoryProgressRepository } from '../support/in-memory-progress-repository.js';
import { levelJson, levelValidators } from '../support/level-format.js';
import { brokenRow } from '../support/level-repository.contract.js';
import { testUserId } from '../support/user-ids.js';
import { valueOf } from '../support/result.js';

// AppModule is the composition root: it binds each account port to one adapter.
describe('AppModule account wiring', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should_bind_account_ports_to_their_adapters_when_app_module_compiles', async () => {
    stubTestEnvironment();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    expect(moduleRef.get(PASSWORD_HASHER)).toBeInstanceOf(ScryptPasswordHasher);
    expect(moduleRef.get(TOKEN_ISSUER)).toBeInstanceOf(JwtTokenIssuer);
    expect(moduleRef.get(USER_ID_GENERATOR)).toBeInstanceOf(RandomUserIdGenerator);
    expect(moduleRef.get(USER_REPOSITORY)).toBeInstanceOf(DrizzleUserRepository);
    expect(moduleRef.get(REGISTER_USER)).toBeInstanceOf(RegisterUseCase);
    expect(moduleRef.get(LOGIN)).toBeInstanceOf(LoginUseCase);
    await moduleRef.close();
  });

  it('should_bind_progress_ports_to_their_adapters_when_app_module_compiles', async () => {
    stubTestEnvironment();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    expect(moduleRef.get(PROGRESS_REPOSITORY)).toBeInstanceOf(DrizzleProgressRepository);
    expect(moduleRef.get(LOGGER)).toBeInstanceOf(NestLogger);
    expect(moduleRef.get(SYNC_PROGRESS)).toBeInstanceOf(LoggingAspect);
    expect(moduleRef.get(GET_PROGRESS)).toBeInstanceOf(GetProgressUseCase);
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
      .compile();
    const sync = moduleRef.get<SyncProgress>(SYNC_PROGRESS);
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    const result = await sync.execute({
      userId: valueOf(UserId.from(testUserId(1))),
      gameId: valueOf(GameId.of('hexa-lines')),
      results: [],
    });

    expect(result.ok).toBe(true);
    expect(log).toHaveBeenCalledExactlyOnceWith('useCase=SyncProgress outcome=success');
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
      .compile();
    const getLevels = moduleRef.get<GetLevels>(GET_LEVELS);
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    const result = await getLevels.execute();

    expect(result.ok).toBe(true);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'useCase=GetLevels outcome=unavailable-level gameId="hexa-fit" levelId="fit-01" reason=invalid-figure',
    );
    expect(log).toHaveBeenCalledExactlyOnceWith('useCase=GetLevels outcome=success');
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
      .compile();
    const getGlobalLeaderboard = moduleRef.get<GetGlobalLeaderboard>(GET_GLOBAL_LEADERBOARD);
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    const result = await getGlobalLeaderboard.execute(valueOf(GameId.of('hexa-fit')));

    expect(result.ok).toBe(true);
    expect(log).toHaveBeenCalledExactlyOnceWith('useCase=GetGlobalLeaderboard outcome=success');
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
      .compile();
    const getLevelLeaderboard = moduleRef.get<GetLevelLeaderboard>(GET_LEVEL_LEADERBOARD);
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const result = await getLevelLeaderboard.execute({
      gameId: valueOf(GameId.of('hexa-fit')),
      levelId: valueOf(LevelId.of('fit-01')),
    });

    expect(result).toEqual({ ok: false, error: { kind: 'unknown-level' } });
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'useCase=GetLevelLeaderboard outcome=failure kind=unknown-level',
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
});
