import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { HealthResponse } from './health.response.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOkResponse({ type: HealthResponse, description: 'The API process is up.' })
  check(): HealthResponse {
    return { status: 'ok' };
  }
}
