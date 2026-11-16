import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DrizzleLeaderboardReader } from '../../src/adapters/persistence/drizzle-leaderboard-reader.js';
import { DrizzleLevelRepository } from '../../src/adapters/persistence/drizzle-level-repository.js';
import { DrizzleProgressRepository } from '../../src/adapters/persistence/drizzle-progress-repository.js';
import { DrizzleUserRepository } from '../../src/adapters/persistence/drizzle-user-repository.js';
import { LoggingAspect } from '../../src/application/aspects/logging-aspect.js';
import {
  GET_LEADERBOARD,
  type GetLeaderboard,
} from '../../src/application/leaderboard/get-leaderboard.use-case.js';
import { GET_LEVELS, GetLevelsUseCase } from '../../src/application/levels/get-levels.use-case.js';
import { UPDATE_LEVELS } from '../../src/application/levels/update-levels.use-case.js';
import { LEADERBOARD_READER } from '../../src/application/ports/leaderboard-reader.js';
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
import { UserId } from '../../src/domain/user/user-id.js';
import { LOGIN, LoginUseCase } from '../../src/application/auth/login.use-case.js';
import { REGISTER_USER, RegisterUseCase } from '../../src/application/auth/register.use-case.js';
import { PASSWORD_HASHER } from '../../src/application/ports/password-hasher.js';
import { TOKEN_ISSUER } from '../../src/application/ports/token-issuer.js';
import { USER_ID_GENERATOR } from '../../src/application/ports/user-id-generator.js';
import { USER_REPOSITORY } from '../../src/application/ports/user-repository.js';
import { AppModule } from '../../src/infrastructure/app.module.js';
import { JwtTokenIssuer } from '../../src/infrastructure/auth/jwt-token-issuer.js';
import { RandomUserIdGenerator } from '../../src/infrastructure/auth/random-user-id-generator.js';
import { ScryptPasswordHasher } from '../../src/infrastructure/auth/scrypt-password-hasher.js';
import { NestLogger } from '../../src/infrastructure/logging/nest-logger.js';
import { stubTestEnvironment } from '../support/http/test-app.js';
import { InMemoryProgressRepository } from '../support/in-memory-progress-repository.js';
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
  // and UpdateLevels share them, and LoggingAspect wraps UpdateLevels.
  it('should_bind_level_ports_and_wrap_update_levels_in_logging_aspect_when_app_module_compiles', async () => {
    stubTestEnvironment();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    expect(moduleRef.get(LEVEL_REPOSITORY)).toBeInstanceOf(DrizzleLevelRepository);
    expect(moduleRef.get(GET_LEVELS)).toBeInstanceOf(GetLevelsUseCase);
    expect(moduleRef.get(UPDATE_LEVELS)).toBeInstanceOf(LoggingAspect);
    await moduleRef.close();
  });

  it('should_bind_the_leaderboard_reader_and_wrap_get_leaderboard_in_logging_aspect_when_app_module_compiles', async () => {
    stubTestEnvironment();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    expect(moduleRef.get(LEADERBOARD_READER)).toBeInstanceOf(DrizzleLeaderboardReader);
    expect(moduleRef.get(GET_LEADERBOARD)).toBeInstanceOf(LoggingAspect);
    await moduleRef.close();
  });

  // The stub reader takes the place of the Drizzle one, so no database is
  // needed. The spy starts after the module is built, so it sees only the
  // line of the aspect.
  it('should_run_get_leaderboard_inside_logging_aspect_when_get_leaderboard_port_is_called', async () => {
    stubTestEnvironment();
    const empty = () => Promise.resolve([]);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LEADERBOARD_READER)
      .useValue({ levelResults: empty, highScores: empty, standings: empty })
      .compile();
    const getLeaderboard = moduleRef.get<GetLeaderboard>(GET_LEADERBOARD);
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    const result = await getLeaderboard.execute({
      board: 'global',
      gameId: valueOf(GameId.of('hexa-fit')),
    });

    expect(result.ok).toBe(true);
    expect(log).toHaveBeenCalledExactlyOnceWith('useCase=GetLeaderboard outcome=success');
    await moduleRef.close();
  });

  it('should_refuse_to_start_when_jwt_secret_is_missing', async () => {
    stubTestEnvironment();
    vi.stubEnv('JWT_SECRET', undefined);

    await expect(Test.createTestingModule({ imports: [AppModule] }).compile()).rejects.toThrow(
      'JWT_SECRET is not set.',
    );
  });
});
