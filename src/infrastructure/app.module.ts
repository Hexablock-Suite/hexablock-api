import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { HealthController } from '../adapters/http/health.controller.js';
import { HttpErrorFilter } from '../adapters/http/http-error.filter.js';
import { CLOCK } from '../application/ports/clock.js';
import { SystemClock } from './clock/system-clock.js';

@Module({
  controllers: [HealthController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    // Every route, also the routes of later modules, answers errors with ErrorDto.
    { provide: APP_FILTER, useClass: HttpErrorFilter },
  ],
})
export class AppModule {}
