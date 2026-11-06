import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AuthController } from '../adapters/http/auth.controller.js';
import { HealthController } from '../adapters/http/health.controller.js';
import { HttpErrorFilter } from '../adapters/http/http-error.filter.js';
import { DrizzleUserRepository } from '../adapters/persistence/drizzle-user-repository.js';
import { LOGIN, LoginUseCase } from '../application/auth/login.use-case.js';
import { REGISTER_USER, RegisterUseCase } from '../application/auth/register.use-case.js';
import { CLOCK } from '../application/ports/clock.js';
import { PASSWORD_HASHER, type PasswordHasher } from '../application/ports/password-hasher.js';
import { TOKEN_ISSUER, type TokenIssuer } from '../application/ports/token-issuer.js';
import { USER_ID_GENERATOR, type UserIdGenerator } from '../application/ports/user-id-generator.js';
import { USER_REPOSITORY, type UserRepository } from '../application/ports/user-repository.js';
import { createJwtService, readJwtSecret } from './auth/auth-config.js';
import { JwtTokenIssuer } from './auth/jwt-token-issuer.js';
import { RandomUserIdGenerator } from './auth/random-user-id-generator.js';
import { ScryptPasswordHasher } from './auth/scrypt-password-hasher.js';
import { SystemClock } from './clock/system-clock.js';
import type { Database } from './database/connection.js';
import { DATABASE, DatabaseModule } from './database/database.module.js';

// The composition root: it binds each port to its adapter.
@Module({
  imports: [DatabaseModule],
  controllers: [HealthController, AuthController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: PASSWORD_HASHER, useClass: ScryptPasswordHasher },
    { provide: USER_ID_GENERATOR, useClass: RandomUserIdGenerator },
    {
      provide: TOKEN_ISSUER,
      useFactory: (): TokenIssuer => new JwtTokenIssuer(createJwtService(readJwtSecret())),
    },
    {
      provide: USER_REPOSITORY,
      inject: [DATABASE],
      useFactory: (database: Database): UserRepository => new DrizzleUserRepository(database),
    },
    {
      provide: REGISTER_USER,
      inject: [USER_REPOSITORY, PASSWORD_HASHER, USER_ID_GENERATOR],
      useFactory: (users: UserRepository, hasher: PasswordHasher, ids: UserIdGenerator) =>
        new RegisterUseCase(users, hasher, ids),
    },
    {
      provide: LOGIN,
      inject: [USER_REPOSITORY, PASSWORD_HASHER, TOKEN_ISSUER],
      useFactory: (users: UserRepository, hasher: PasswordHasher, tokens: TokenIssuer) =>
        new LoginUseCase(users, hasher, tokens),
    },
    // Every route, also the routes of later modules, answers errors with ErrorDto.
    { provide: APP_FILTER, useClass: HttpErrorFilter },
  ],
})
export class AppModule {}
