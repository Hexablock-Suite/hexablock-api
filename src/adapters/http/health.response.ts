import { ApiProperty } from '@nestjs/swagger';

export class HealthResponse {
  @ApiProperty({ enum: ['ok'], example: 'ok' })
  readonly status!: 'ok';
}
