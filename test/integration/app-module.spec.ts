import { Test } from '@nestjs/testing';
import { DrizzleUserRepository } from '../../src/adapters/persistence/drizzle-user-repository.js';
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
import { stubTestEnvironment } from '../support/http/test-app.js';

// AppModule is the composition root: it binds each account port to one adapter.
describe('AppModule account wiring', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
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

  it('should_refuse_to_start_when_jwt_secret_is_missing', async () => {
    stubTestEnvironment();
    vi.stubEnv('JWT_SECRET', undefined);

    await expect(Test.createTestingModule({ imports: [AppModule] }).compile()).rejects.toThrow(
      'JWT_SECRET is not set.',
    );
  });
});
