import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AuthController } from '../adapters/http/auth.controller.js';
import { HealthController } from '../adapters/http/health.controller.js';
import { HttpErrorFilter } from '../adapters/http/http-error.filter.js';
import { ProgressController } from '../adapters/http/progress.controller.js';
import { DrizzleProgressRepository } from '../adapters/persistence/drizzle-progress-repository.js';
import { DrizzleUserRepository } from '../adapters/persistence/drizzle-user-repository.js';
import {
  AUTHENTICATE_TOKEN,
  AuthenticateTokenUseCase,
} from '../application/auth/authenticate-token.use-case.js';
import { LOGIN, LoginUseCase } from '../application/auth/login.use-case.js';
import { REGISTER_USER, RegisterUseCase } from '../application/auth/register.use-case.js';
import { CLOCK, type Clock } from '../application/ports/clock.js';
import { PASSWORD_HASHER, type PasswordHasher } from '../application/ports/password-hasher.js';
import {
  PROGRESS_REPOSITORY,
  type ProgressRepository,
} from '../application/ports/progress-repository.js';
import { TOKEN_ISSUER, type TokenIssuer } from '../application/ports/token-issuer.js';
import { USER_ID_GENERATOR, type UserIdGenerator } from '../application/ports/user-id-generator.js';
import { USER_REPOSITORY, type UserRepository } from '../application/ports/user-repository.js';
import { GET_PROGRESS, GetProgressUseCase } from '../application/progress/get-progress.use-case.js';
import {
  SYNC_PROGRESS,
  SyncProgressUseCase,
} from '../application/progress/sync-progress.use-case.js';
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
  controllers: [HealthController, AuthController, ProgressController],
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
    {
      provide: AUTHENTICATE_TOKEN,
      inject: [TOKEN_ISSUER],
      useFactory: (tokens: TokenIssuer) => new AuthenticateTokenUseCase(tokens),
    },
    {
      provide: PROGRESS_REPOSITORY,
      inject: [DATABASE],
      useFactory: (database: Database): ProgressRepository =>
        new DrizzleProgressRepository(database),
    },
    {
      provide: SYNC_PROGRESS,
      inject: [PROGRESS_REPOSITORY, CLOCK],
      useFactory: (progress: ProgressRepository, clock: Clock) =>
        new SyncProgressUseCase(progress, clock),
    },
    {
      provide: GET_PROGRESS,
      inject: [PROGRESS_REPOSITORY],
      useFactory: (progress: ProgressRepository) => new GetProgressUseCase(progress),
    },
    // Every route, also the routes of later modules, answers errors with ErrorDto.
    { provide: APP_FILTER, useClass: HttpErrorFilter },
  ],
})
export class AppModule {}
