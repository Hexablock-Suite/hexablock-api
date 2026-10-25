import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

// The UI lives at /docs. The JSON document lives at /docs-json.
const DOCS_PATH = 'docs';

// The served document and the committed openapi/openapi.json both come from
// this function. scripts/openapi/export.js calls it on the built app.
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('HexaBlock API')
    .setDescription('Users, progress, leaderboards and level definitions.')
    .setVersion('0.0.1')
    .build();
  return SwaggerModule.createDocument(app, config);
}

export function configureHttpApp(app: INestApplication): void {
  SwaggerModule.setup(DOCS_PATH, app, () => buildOpenApiDocument(app), {
    jsonDocumentUrl: `${DOCS_PATH}-json`,
  });
}
