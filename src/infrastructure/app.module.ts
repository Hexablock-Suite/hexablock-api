import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AuthController } from '../adapters/http/auth.controller.js';
import { HealthController } from '../adapters/http/health.controller.js';
import { HttpErrorFilter } from '../adapters/http/http-error.filter.js';
import { LeaderboardController } from '../adapters/http/leaderboard.controller.js';
import { LevelsController } from '../adapters/http/levels.controller.js';
import { ProgressController } from '../adapters/http/progress.controller.js';
import { DrizzleLeaderboardReader } from '../adapters/persistence/drizzle-leaderboard-reader.js';
import { DrizzleLevelRepository } from '../adapters/persistence/drizzle-level-repository.js';
import { DrizzleProgressRepository } from '../adapters/persistence/drizzle-progress-repository.js';
import { DrizzleUserRepository } from '../adapters/persistence/drizzle-user-repository.js';
import {
  AUTHENTICATE_TOKEN,
  AuthenticateTokenUseCase,
} from '../application/auth/authenticate-token.use-case.js';
import { LOGIN, LoginUseCase } from '../application/auth/login.use-case.js';
import { REGISTER_USER, RegisterUseCase } from '../application/auth/register.use-case.js';
import { LoggingAspect } from '../application/aspects/logging-aspect.js';
import {
  GET_LEADERBOARD,
  GetLeaderboardUseCase,
} from '../application/leaderboard/get-leaderboard.use-case.js';
import {
  AUTHORIZE_LEVEL_EDITOR,
  AuthorizeLevelEditorUseCase,
} from '../application/levels/authorize-level-editor.use-case.js';
import { GET_LEVELS, GetLevelsUseCase } from '../application/levels/get-levels.use-case.js';
import {
  UPDATE_LEVELS,
  UpdateLevelsUseCase,
} from '../application/levels/update-levels.use-case.js';
import { CLOCK, type Clock } from '../application/ports/clock.js';
import {
  LEADERBOARD_READER,
  type LeaderboardReader,
} from '../application/ports/leaderboard-reader.js';
import { LEVEL_REPOSITORY, type LevelRepository } from '../application/ports/level-repository.js';
import { LOGGER, type Logger } from '../application/ports/logger.js';
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
import { FitLevelValidator } from '../domain/level/fit/fit-level-validator.js';
import { HexTopology } from '../domain/level/hex-topology.js';
import { LevelValidators } from '../domain/level/level-validators.js';
import { SortLevelValidator } from '../domain/level/sort/sort-level-validator.js';
import { Topologies } from '../domain/level/topologies.js';
import { TopologyId } from '../domain/level/topology-id.js';
import { GameId } from '../domain/progress/game-id.js';
import { createJwtService, readJwtSecret, readLevelEditors } from './auth/auth-config.js';
import { JwtTokenIssuer } from './auth/jwt-token-issuer.js';
import { RandomUserIdGenerator } from './auth/random-user-id-generator.js';
import { ScryptPasswordHasher } from './auth/scrypt-password-hasher.js';
import { SystemClock } from './clock/system-clock.js';
import type { Database } from './database/connection.js';
import { DATABASE, DatabaseModule } from './database/database.module.js';
import { NestLogger } from './logging/nest-logger.js';

// The token of the one LevelValidators of the API. The level store and
// UpdateLevels share it.
export const LEVEL_VALIDATORS = Symbol('LevelValidators');

// The strategies of the variants with level files (decision 5), under the
// game ids of the product: hexa-fit and hexa-sort. Fit reads the rotation
// steps of the hex topology (decision 6). hexa-lines and hexa-merge have no
// level files, so they have no entry (API-FR-04).
function levelValidators(): LevelValidators {
  const hex = TopologyId.of('hex');
  if (!hex.ok) {
    throw new Error('The topology id hex must be valid.');
  }
  const fit = GameId.of('hexa-fit');
  const sort = GameId.of('hexa-sort');
  if (!fit.ok || !sort.ok) {
    throw new Error('The game ids hexa-fit and hexa-sort must be valid.');
  }
  return LevelValidators.of([
    [fit.value, new FitLevelValidator(Topologies.of([[hex.value, new HexTopology()]]))],
    [sort.value, new SortLevelValidator()],
  ]);
}

// The composition root: it binds each port to its adapter.
@Module({
  imports: [DatabaseModule],
  controllers: [
    HealthController,
    AuthController,
    ProgressController,
    LevelsController,
    LeaderboardController,
  ],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: LOGGER, useFactory: (): Logger => new NestLogger() },
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
      inject: [TOKEN_ISSUER, USER_REPOSITORY],
      useFactory: (tokens: TokenIssuer, users: UserRepository) =>
        new AuthenticateTokenUseCase(tokens, users),
    },
    {
      provide: PROGRESS_REPOSITORY,
      inject: [DATABASE],
      useFactory: (database: Database): ProgressRepository =>
        new DrizzleProgressRepository(database),
    },
    // LoggingAspect wraps the use case, so the use case holds no logging code.
    {
      provide: SYNC_PROGRESS,
      inject: [PROGRESS_REPOSITORY, CLOCK, LOGGER],
      useFactory: (progress: ProgressRepository, clock: Clock, logger: Logger) =>
        new LoggingAspect(new SyncProgressUseCase(progress, clock), 'SyncProgress', logger),
    },
    {
      provide: GET_PROGRESS,
      inject: [PROGRESS_REPOSITORY],
      useFactory: (progress: ProgressRepository) => new GetProgressUseCase(progress),
    },
    { provide: LEVEL_VALIDATORS, useFactory: (): LevelValidators => levelValidators() },
    {
      provide: LEVEL_REPOSITORY,
      inject: [DATABASE, LEVEL_VALIDATORS],
      useFactory: (database: Database, validators: LevelValidators): LevelRepository =>
        new DrizzleLevelRepository(database, validators),
    },
    {
      provide: GET_LEVELS,
      inject: [LEVEL_REPOSITORY],
      useFactory: (levels: LevelRepository) => new GetLevelsUseCase(levels),
    },
    {
      provide: UPDATE_LEVELS,
      inject: [LEVEL_REPOSITORY, LEVEL_VALIDATORS, LOGGER],
      useFactory: (levels: LevelRepository, validators: LevelValidators, logger: Logger) =>
        new LoggingAspect(new UpdateLevelsUseCase(levels, validators), 'UpdateLevels', logger),
    },
    // The list of level editors comes from LEVEL_EDITOR_IDS (#145).
    {
      provide: AUTHORIZE_LEVEL_EDITOR,
      useFactory: () => new AuthorizeLevelEditorUseCase(readLevelEditors()),
    },
    {
      provide: LEADERBOARD_READER,
      inject: [DATABASE],
      useFactory: (database: Database): LeaderboardReader => new DrizzleLeaderboardReader(database),
    },
    {
      provide: GET_LEADERBOARD,
      inject: [LEADERBOARD_READER, LOGGER],
      useFactory: (leaderboard: LeaderboardReader, logger: Logger) =>
        new LoggingAspect(new GetLeaderboardUseCase(leaderboard), 'GetLeaderboard', logger),
    },
    // Every route, also the routes of later modules, answers errors with ErrorDto.
    { provide: APP_FILTER, useClass: HttpErrorFilter },
  ],
})
export class AppModule {}
