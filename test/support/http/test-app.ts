import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types.js';
import { DrizzleLeaderboardReader } from '../../../src/adapters/persistence/drizzle-leaderboard-reader.js';
import { DrizzleLevelRepository } from '../../../src/adapters/persistence/drizzle-level-repository.js';
import { DrizzleProgressRepository } from '../../../src/adapters/persistence/drizzle-progress-repository.js';
import { DrizzleUserRepository } from '../../../src/adapters/persistence/drizzle-user-repository.js';
import { CLOCK, type Clock } from '../../../src/application/ports/clock.js';
import { LEADERBOARD_READER } from '../../../src/application/ports/leaderboard-reader.js';
import { LEVEL_REPOSITORY } from '../../../src/application/ports/level-repository.js';
import { PROGRESS_REPOSITORY } from '../../../src/application/ports/progress-repository.js';
import { USER_REPOSITORY } from '../../../src/application/ports/user-repository.js';
import type { LevelValidators } from '../../../src/domain/level/level-validators.js';
import { AppModule, LEVEL_VALIDATORS } from '../../../src/infrastructure/app.module.js';
import { configureHttpApp } from '../../../src/infrastructure/http-app.js';
import { TEST_JWT_SECRET } from '../auth/test-jwt-secret.js';
import { createTestDatabase, type TestDatabase } from '../test-database.js';

export { TEST_JWT_SECRET };

// The pool connects only on the first query. The tests replace the user,
// progress and level repositories and the leaderboard reader, so no query
// reaches this URL.
const UNUSED_DATABASE_URL = 'postgres://test:test@127.0.0.1:1/unused';

// Sets the configuration that AppModule reads. Call vi.unstubAllEnvs() after the test.
export function stubTestEnvironment(): void {
  vi.stubEnv('JWT_SECRET', TEST_JWT_SECRET);
  vi.stubEnv('DATABASE_URL', UNUSED_DATABASE_URL);
}

export interface TestApp {
  readonly app: INestApplication<App>;
  readonly database: TestDatabase;
  close(): Promise<void>;
}

export interface TestAppOptions {
  // Replaces the system clock, so a test can assert the stored instants.
  readonly clock?: Clock;
}

// Starts AppModule with the test configuration. The user, progress and level
// repositories and the leaderboard reader run on the in-memory PGlite
// database, so a test can read the stored rows. The level repository keeps
// the LevelValidators of AppModule.
export async function createTestApp(
  controllers: Type<unknown>[] = [],
  options: TestAppOptions = {},
): Promise<TestApp> {
  stubTestEnvironment();
  const database = await createTestDatabase();
  let builder = Test.createTestingModule({ imports: [AppModule], controllers })
    .overrideProvider(USER_REPOSITORY)
    .useValue(new DrizzleUserRepository(database.db))
    .overrideProvider(PROGRESS_REPOSITORY)
    .useValue(new DrizzleProgressRepository(database.db))
    .overrideProvider(LEVEL_REPOSITORY)
    .useFactory({
      inject: [LEVEL_VALIDATORS],
      factory: (validators: LevelValidators) => new DrizzleLevelRepository(database.db, validators),
    })
    .overrideProvider(LEADERBOARD_READER)
    .useValue(new DrizzleLeaderboardReader(database.db));
  if (options.clock !== undefined) {
    builder = builder.overrideProvider(CLOCK).useValue(options.clock);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>({ logger: false });
  configureHttpApp(app);
  await app.init();
  return {
    app,
    database,
    async close() {
      await app.close();
      await database.close();
      vi.unstubAllEnvs();
    },
  };
}
