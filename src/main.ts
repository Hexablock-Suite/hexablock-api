// Composition root. It is the only place that wires every layer together.
import { NestFactory } from '@nestjs/core';
import { AppModule } from './infrastructure/app.module.js';
import { configureHttpApp } from './infrastructure/http-app.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureHttpApp(app);
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
