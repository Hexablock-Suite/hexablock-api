// Bootstrap. It creates the Nest app from AppModule and starts the HTTP
// server. AppModule is the composition root: it binds each port to its adapter.
import { NestFactory } from '@nestjs/core';
import { AppModule } from './infrastructure/app.module.js';
import { configureHttpApp } from './infrastructure/http-app.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureHttpApp(app);
  // SIGTERM and SIGINT run the shutdown sequence of Nest: the HTTP server
  // closes first, and DatabaseModule ends the pool last (#173). Without this
  // call a signal ends the process with no cleanup at all.
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
