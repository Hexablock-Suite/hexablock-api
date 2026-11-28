import type { INestApplication, LogLevel } from '@nestjs/common';
import { getOptionsToken } from '@nestjs/throttler';
import type { App } from 'supertest/types.js';
import { readAuthThrottle } from '../../../src/infrastructure/auth/auth-config.js';
import { configureHttpApp } from '../../../src/infrastructure/http-app.js';
import { testModuleOf } from '../http/test-app.js';
import { createTestDatabase } from '../test-database.js';
import { PROVIDER_DATABASE, ProviderStatesController } from './provider-states.controller.js';

export interface ProviderApp {
  readonly app: INestApplication<App>;
  close(): Promise<void>;
}

// The provider composition of the contract job (#151): AppModule on an
// in-memory PGlite database, plus the state-change endpoint. The CI jobs
// have no Postgres, so the composition needs none. It reads the
// configuration that AppModule reads: JWT_SECRET, DATABASE_URL (never
// queried) and LEVEL_EDITOR_IDS. The rate limit of sign-up and sign-in is
// always off, whatever AUTH_RATE_LIMIT holds, because the contract job signs
// in for each provider state (#170). The app CI starts this composition too.
// scripts/contract/start-provider.js starts it; the e2e tests call it in
// process.
export async function createProviderApp(logger: false | LogLevel[] = false): Promise<ProviderApp> {
  const database = await createTestDatabase();
  const moduleRef = await testModuleOf(database, {
    controllers: [ProviderStatesController],
    providers: [{ provide: PROVIDER_DATABASE, useValue: database }],
  })
    .overrideProvider(getOptionsToken())
    .useValue(readAuthThrottle({ AUTH_RATE_LIMIT: 'off' }))
    .compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>({ logger });
  configureHttpApp(app);
  await app.init();
  return {
    app,
    async close() {
      await app.close();
      await database.close();
    },
  };
}
