import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { ErrorDto } from '../adapters/http/error.dto.js';

// The UI lives at /docs. The JSON document lives at /docs-json.
const DOCS_PATH = 'docs';

// The served document and the committed openapi/openapi.json both come from
// this function. scripts/openapi/export.js calls it on the built app.
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('HexaBlock API')
    .setDescription('Users, progress, leaderboards and level definitions.')
    .setVersion('0.0.1')
    .addBearerAuth()
    .build();
  // ErrorDto is in the document even before an endpoint names it, so the
  // client can generate the error type (API-FR-06).
  return SwaggerModule.createDocument(app, config, { extraModels: [ErrorDto] });
}

export function configureHttpApp(app: INestApplication): void {
  // Every route is served under the /v1 URI version prefix (decision of
  // 2026-11-23, recorded in docs/REQUIREMENTS.md). No other form of HTTP
  // versioning: the prefix is exactly v1.
  app.setGlobalPrefix('v1');
  SwaggerModule.setup(DOCS_PATH, app, () => buildOpenApiDocument(app), {
    jsonDocumentUrl: `${DOCS_PATH}-json`,
  });
}
