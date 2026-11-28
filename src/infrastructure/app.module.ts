import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { PerformanceStopwatch } from '../adapters/clock/performance-stopwatch.js';
import { SystemClock } from '../adapters/clock/system-clock.js';
import { RandomUserIdGenerator } from '../adapters/crypto/random-user-id-generator.js';
import { ScryptPasswordHasher } from '../adapters/crypto/scrypt-password-hasher.js';
import { AuthController } from '../adapters/http/auth.controller.js';
import { HealthController } from '../adapters/http/health.controller.js';
import { HttpErrorFilter } from '../adapters/http/http-error.filter.js';
import { LeaderboardController } from '../adapters/http/leaderboard.controller.js';
import { LevelsController } from '../adapters/http/levels.controller.js';
import { ProgressController } from '../adapters/http/progress.controller.js';
import { JwtTokenIssuer } from '../adapters/jwt/jwt-token-issuer.js';
import { NestLogger } from '../adapters/logging/nest-logger.js';
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
  GET_GLOBAL_LEADERBOARD,
  GetGlobalLeaderboardUseCase,
} from '../application/leaderboard/get-global-leaderboard.use-case.js';
import {
  GET_LEVEL_LEADERBOARD,
  GetLevelLeaderboardUseCase,
} from '../application/leaderboard/get-level-leaderboard.use-case.js';
import {
  AUTHORIZE_LEVEL_EDITOR,
  AuthorizeLevelEditorUseCase,
} from '../application/levels/authorize-level-editor.use-case.js';
import { GET_LEVELS, GetLevelsUseCase } from '../application/levels/get-levels.use-case.js';
import { unavailableLevelEntries } from '../application/levels/unavailable-level-entries.js';
import {
  UPDATE_LEVELS,
  UpdateLevelsUseCase,
} from '../application/levels/update-levels.use-case.js';
import { CLOCK, type Clock } from '../application/ports/clock.js';
import {
  GLOBAL_BOARD_READER,
  type GlobalBoardReader,
} from '../application/ports/global-board-reader.js';
import {
  LEVEL_BOARD_READER,
  type LevelBoardReader,
} from '../application/ports/level-board-reader.js';
import {
  LEVEL_REPOSITORY,
  type LevelFinder,
  type LevelHolder,
  type LevelLister,
  type LevelRepository,
  type LevelUpdater,
} from '../application/ports/level-repository.js';
import { LOGGER, type Logger } from '../application/ports/logger.js';
import { STOPWATCH, type Stopwatch } from '../application/ports/stopwatch.js';
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
import { SquareTopology } from '../domain/level/square-topology.js';
import { Topologies } from '../domain/level/topologies.js';
import { TopologyId } from '../domain/level/topology-id.js';
import { TriangleTopology } from '../domain/level/triangle-topology.js';
import { GameId } from '../domain/progress/game-id.js';
import {
  createJwtService,
  readAuthThrottle,
  readJwtSecret,
  readLevelEditors,
} from './auth/auth-config.js';
import type { Database } from './database/connection.js';
import { DATABASE, DatabaseModule } from './database/database.module.js';

// The token of the one LevelValidators of the API. The level store and
// UpdateLevels share it.
export const LEVEL_VALIDATORS = Symbol('LevelValidators');

// The strategies of the variants with level files (decision 5), under the
// game ids of the product: hexa-fit and hexa-sort. Fit reads the rotation
// steps and the moves of the hex, square and triangle topologies (decision 6,
// #229). hexa-lines and hexa-merge have no level files, so they have no entry
// (API-FR-04).
function levelValidators(): LevelValidators {
  const hex = TopologyId.of('hex');
  const square = TopologyId.of('square');
  const triangle = TopologyId.of('triangle');
  if (!hex.ok || !square.ok || !triangle.ok) {
    throw new Error('The topology ids hex, square and triangle must be valid.');
  }
  const fit = GameId.of('hexa-fit');
  const sort = GameId.of('hexa-sort');
  if (!fit.ok || !sort.ok) {
    throw new Error('The game ids hexa-fit and hexa-sort must be valid.');
  }
  return LevelValidators.of([
    [
      fit.value,
      new FitLevelValidator(
        Topologies.of([
          [hex.value, new HexTopology()],
          [square.value, new SquareTopology()],
          [triangle.value, new TriangleTopology()],
        ]),
      ),
    ],
    [sort.value, new SortLevelValidator()],
  ]);
}

// The composition root: it binds each port to its adapter.
@Module({
  // ThrottlerModule holds the rate limit of sign-up and sign-in, which
  // AUTH_RATE_LIMIT sets (#170). The factory reads it when the module starts.
  imports: [DatabaseModule, ThrottlerModule.forRootAsync({ useFactory: () => readAuthThrottle() })],
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
    // Each LoggingAspect reads the duration of a call from this port (#181).
    { provide: STOPWATCH, useClass: PerformanceStopwatch },
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
    // LoggingAspect wraps each use case under the name of its input port, so
    // the use case holds no logging code. AuthorizeLevelEditorUseCase is the
    // one use case without it (#170).
    {
      provide: REGISTER_USER,
      inject: [USER_REPOSITORY, PASSWORD_HASHER, USER_ID_GENERATOR, LOGGER, STOPWATCH],
      useFactory: (
        users: UserRepository,
        hasher: PasswordHasher,
        ids: UserIdGenerator,
        logger: Logger,
        stopwatch: Stopwatch,
      ) =>
        new LoggingAspect(
          new RegisterUseCase(users, hasher, ids),
          'RegisterUser',
          logger,
          stopwatch,
        ),
    },
    {
      provide: LOGIN,
      inject: [USER_REPOSITORY, PASSWORD_HASHER, TOKEN_ISSUER, LOGGER, STOPWATCH],
      useFactory: (
        users: UserRepository,
        hasher: PasswordHasher,
        tokens: TokenIssuer,
        logger: Logger,
        stopwatch: Stopwatch,
      ) => new LoggingAspect(new LoginUseCase(users, hasher, tokens), 'Login', logger, stopwatch),
    },
    {
      provide: AUTHENTICATE_TOKEN,
      inject: [TOKEN_ISSUER, USER_REPOSITORY, LOGGER, STOPWATCH],
      useFactory: (
        tokens: TokenIssuer,
        users: UserRepository,
        logger: Logger,
        stopwatch: Stopwatch,
      ) =>
        new LoggingAspect(
          new AuthenticateTokenUseCase(tokens, users),
          'AuthenticateToken',
          logger,
          stopwatch,
        ),
    },
    {
      provide: PROGRESS_REPOSITORY,
      inject: [DATABASE],
      useFactory: (database: Database): ProgressRepository =>
        new DrizzleProgressRepository(database),
    },
    {
      provide: SYNC_PROGRESS,
      inject: [PROGRESS_REPOSITORY, LEVEL_REPOSITORY, CLOCK, LOGGER, STOPWATCH],
      useFactory: (
        progress: ProgressRepository,
        levels: LevelFinder,
        clock: Clock,
        logger: Logger,
        stopwatch: Stopwatch,
      ) =>
        new LoggingAspect(
          new SyncProgressUseCase(progress, levels, clock),
          'SyncProgress',
          logger,
          stopwatch,
        ),
    },
    {
      provide: GET_PROGRESS,
      inject: [PROGRESS_REPOSITORY, LOGGER, STOPWATCH],
      useFactory: (progress: ProgressRepository, logger: Logger, stopwatch: Stopwatch) =>
        new LoggingAspect(new GetProgressUseCase(progress), 'GetProgress', logger, stopwatch),
    },
    { provide: LEVEL_VALIDATORS, useFactory: (): LevelValidators => levelValidators() },
    // One DrizzleLevelRepository plays the four roles of the LevelRepository
    // port. Each level use case gets the one LEVEL_REPOSITORY instance, typed
    // by the role that it holds, so no role has a token of its own (#193).
    {
      provide: LEVEL_REPOSITORY,
      inject: [DATABASE, LEVEL_VALIDATORS],
      useFactory: (database: Database, validators: LevelValidators): LevelRepository =>
        new DrizzleLevelRepository(database, validators),
    },
    {
      provide: GET_LEVELS,
      inject: [LEVEL_REPOSITORY, LOGGER, STOPWATCH],
      // The aspect also writes one entry per broken level row (#219).
      useFactory: (levels: LevelLister, logger: Logger, stopwatch: Stopwatch) =>
        new LoggingAspect(
          new GetLevelsUseCase(levels),
          'GetLevels',
          logger,
          stopwatch,
          unavailableLevelEntries,
        ),
    },
    {
      provide: UPDATE_LEVELS,
      inject: [LEVEL_REPOSITORY, LEVEL_VALIDATORS, LOGGER, STOPWATCH],
      useFactory: (
        levels: LevelUpdater,
        validators: LevelValidators,
        logger: Logger,
        stopwatch: Stopwatch,
      ) =>
        new LoggingAspect(
          new UpdateLevelsUseCase(levels, validators),
          'UpdateLevels',
          logger,
          stopwatch,
        ),
    },
    // The list of level editors comes from LEVEL_EDITOR_IDS (#145).
    {
      provide: AUTHORIZE_LEVEL_EDITOR,
      useFactory: () => new AuthorizeLevelEditorUseCase(readLevelEditors()),
    },
    // One DrizzleLeaderboardReader implements both board reader ports. Each
    // port token is an alias of the class token, so both give the same
    // instance (#218).
    {
      provide: DrizzleLeaderboardReader,
      inject: [DATABASE],
      useFactory: (database: Database) => new DrizzleLeaderboardReader(database),
    },
    { provide: GLOBAL_BOARD_READER, useExisting: DrizzleLeaderboardReader },
    { provide: LEVEL_BOARD_READER, useExisting: DrizzleLeaderboardReader },
    {
      provide: GET_GLOBAL_LEADERBOARD,
      inject: [GLOBAL_BOARD_READER, LOGGER, STOPWATCH],
      useFactory: (boards: GlobalBoardReader, logger: Logger, stopwatch: Stopwatch) =>
        new LoggingAspect(
          new GetGlobalLeaderboardUseCase(boards),
          'GetGlobalLeaderboard',
          logger,
          stopwatch,
        ),
    },
    {
      provide: GET_LEVEL_LEADERBOARD,
      inject: [LEVEL_BOARD_READER, LEVEL_REPOSITORY, LOGGER, STOPWATCH],
      useFactory: (
        boards: LevelBoardReader,
        levels: LevelHolder,
        logger: Logger,
        stopwatch: Stopwatch,
      ) =>
        new LoggingAspect(
          new GetLevelLeaderboardUseCase(boards, levels),
          'GetLevelLeaderboard',
          logger,
          stopwatch,
        ),
    },
    // Every route, also the routes of later modules, answers errors with ErrorDto.
    { provide: APP_FILTER, useClass: HttpErrorFilter },
  ],
})
export class AppModule {}
