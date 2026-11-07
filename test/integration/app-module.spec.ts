import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DrizzleProgressRepository } from '../../src/adapters/persistence/drizzle-progress-repository.js';
import { DrizzleUserRepository } from '../../src/adapters/persistence/drizzle-user-repository.js';
import { LoggingAspect } from '../../src/application/aspects/logging-aspect.js';
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

  // The invalid gameId fails before any query, so no database is needed.
  it('should_run_sync_progress_inside_logging_aspect_when_sync_progress_port_is_called', async () => {
    stubTestEnvironment();
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const sync = moduleRef.get<SyncProgress>(SYNC_PROGRESS);

    const result = await sync.execute({
      userId: UserId.from('user-1'),
      gameId: 'Hexa Lines',
      results: [],
    });

    const error = {
      kind: 'invalid-progress',
      problems: ['gameId must be a lowercase slug, got "Hexa Lines".'],
    };
    expect(result).toEqual({ ok: false, error });
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'useCase=SyncProgress outcome=failure kind=invalid-progress',
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('Hexa Lines');
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
