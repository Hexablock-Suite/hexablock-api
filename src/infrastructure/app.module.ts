import { Module } from '@nestjs/common';
import { HealthController } from '../adapters/http/health.controller.js';
import { CLOCK } from '../domain/shared/clock.js';
import { SystemClock } from './clock/system-clock.js';

@Module({
  controllers: [HealthController],
  providers: [{ provide: CLOCK, useClass: SystemClock }],
})
export class AppModule {}
