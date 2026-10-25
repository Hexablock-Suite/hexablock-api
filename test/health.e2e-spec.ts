import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/infrastructure/app.module.js';
import { configureHttpApp } from '../src/infrastructure/http-app.js';

describe('HTTP entry points', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureHttpApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should_return_ok_status_when_health_is_requested', async () => {
    const response = await request(app.getHttpServer()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('should_serve_openapi_document_when_docs_json_is_requested', async () => {
    const response = await request(app.getHttpServer()).get('/docs-json');

    expect(response.status).toBe(200);
    expect(response.body.openapi).toMatch(/^3\./);
    expect(response.body.paths).toHaveProperty('/health');
  });

  it('should_match_committed_openapi_file_when_docs_json_is_requested', async () => {
    const committed: unknown = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../openapi/openapi.json'), 'utf8'),
    );

    const response = await request(app.getHttpServer()).get('/docs-json');

    expect(response.body).toEqual(committed);
  });
});
