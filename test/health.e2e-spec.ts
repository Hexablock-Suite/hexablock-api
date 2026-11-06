import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp, type TestApp } from './support/http/test-app.js';

describe('HTTP entry points', () => {
  let testApp: TestApp;
  let app: INestApplication<App>;

  beforeEach(async () => {
    testApp = await createTestApp();
    app = testApp.app;
  });

  afterEach(async () => {
    await testApp.close();
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
