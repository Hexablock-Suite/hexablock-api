import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// The UI lives at /docs. The JSON document lives at /docs-json.
const DOCS_PATH = 'docs';

export function configureHttpApp(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('HexaBlock API')
    .setDescription('Users, progress, leaderboards and level definitions.')
    .setVersion('0.0.1')
    .build();
  SwaggerModule.setup(DOCS_PATH, app, () => SwaggerModule.createDocument(app, config), {
    jsonDocumentUrl: `${DOCS_PATH}-json`,
  });
}
