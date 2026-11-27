import type { INestApplication, Provider, Type } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { App } from 'supertest/types.js';
import { DrizzleLeaderboardReader } from '../../../src/adapters/persistence/drizzle-leaderboard-reader.js';
import { DrizzleLevelRepository } from '../../../src/adapters/persistence/drizzle-level-repository.js';
import { DrizzleProgressRepository } from '../../../src/adapters/persistence/drizzle-progress-repository.js';
import { DrizzleUserRepository } from '../../../src/adapters/persistence/drizzle-user-repository.js';
import { CLOCK, type Clock } from '../../../src/application/ports/clock.js';
import { LEVEL_REPOSITORY } from '../../../src/application/ports/level-repository.js';
import { PROGRESS_REPOSITORY } from '../../../src/application/ports/progress-repository.js';
import {
  USER_ID_GENERATOR,
  type UserIdGenerator,
} from '../../../src/application/ports/user-id-generator.js';
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
// The list of level editors is empty, so no account may update the levels
// (#145). A LEVEL_EDITOR_IDS of the shell never reaches a test.
export function stubTestEnvironment(): void {
  vi.stubEnv('JWT_SECRET', TEST_JWT_SECRET);
  vi.stubEnv('DATABASE_URL', UNUSED_DATABASE_URL);
  vi.stubEnv('LEVEL_EDITOR_IDS', '');
}

export interface TestApp {
  readonly app: INestApplication<App>;
  readonly database: TestDatabase;
  close(): Promise<void>;
}

export interface TestModuleOptions {
  // Extra controllers and providers of the root module of the test.
  readonly controllers?: Type<unknown>[];
  readonly providers?: Provider[];
  // Replaces the system clock, so a test can assert the stored instants.
  readonly clock?: Clock;
  // Replaces the random user ids, so a test knows the id of each account
  // before it signs up.
  readonly userIds?: UserIdGenerator;
}

export interface TestAppOptions extends Pick<TestModuleOptions, 'clock' | 'userIds'> {
  // The user ids that may update the levels (#145). Without it, no account may.
  readonly levelEditorIds?: readonly string[];
}

// Builds the module of AppModule on the given database. The user, progress
// and level repositories and the leaderboard reader run on that database.
// The level repository keeps the LevelValidators of AppModule. The function
// stubs no environment, so the provider composition of the contract job
// calls it outside Vitest too (#151).
export function testModuleOf(
  database: TestDatabase,
  options: TestModuleOptions = {},
): TestingModuleBuilder {
  let builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controllers ?? [],
    providers: options.providers ?? [],
  })
    .overrideProvider(USER_REPOSITORY)
    .useValue(new DrizzleUserRepository(database.db))
    .overrideProvider(PROGRESS_REPOSITORY)
    .useValue(new DrizzleProgressRepository(database.db))
    .overrideProvider(LEVEL_REPOSITORY)
    .useFactory({
      inject: [LEVEL_VALIDATORS],
      factory: (validators: LevelValidators) => new DrizzleLevelRepository(database.db, validators),
    })
    .overrideProvider(DrizzleLeaderboardReader)
    .useValue(new DrizzleLeaderboardReader(database.db));
  if (options.clock !== undefined) {
    builder = builder.overrideProvider(CLOCK).useValue(options.clock);
  }
  if (options.userIds !== undefined) {
    builder = builder.overrideProvider(USER_ID_GENERATOR).useValue(options.userIds);
  }
  return builder;
}

// Starts AppModule with the test configuration. The user, progress and level
// repositories and the leaderboard reader run on the in-memory PGlite
// database, so a test can read the stored rows.
export async function createTestApp(
  controllers: Type<unknown>[] = [],
  options: TestAppOptions = {},
): Promise<TestApp> {
  stubTestEnvironment();
  if (options.levelEditorIds !== undefined) {
    vi.stubEnv('LEVEL_EDITOR_IDS', options.levelEditorIds.join(','));
  }
  const database = await createTestDatabase();
  const moduleRef = await testModuleOf(database, {
    controllers,
    clock: options.clock,
    userIds: options.userIds,
  }).compile();
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
