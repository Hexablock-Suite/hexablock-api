import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// The result of one level (DS-5).
export class LevelResultDto {
  @ApiProperty({ example: 'fit-01' })
  readonly levelId!: string;

  @ApiProperty({ example: 3, minimum: 0, description: 'A non-negative integer.' })
  readonly stars!: number;

  @ApiProperty({ example: 12, minimum: 0, description: 'A non-negative integer.' })
  readonly moves!: number;

  @ApiProperty({ example: 45000, minimum: 0, description: 'A non-negative integer.' })
  readonly elapsedMs!: number;
}

// The body of POST /progress (API-FR-02). The user comes from the bearer
// token, so the body has no userId.
export class SyncProgressDto {
  @ApiProperty({
    example: 'hexa-lines',
    pattern: '^[a-z][a-z0-9-]*$',
    description: 'The game variant. Required.',
  })
  readonly gameId!: string;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    example: 120,
    minimum: 0,
    description: 'The score of the game. The API keeps the highest one.',
  })
  readonly score?: number | null;

  @ApiPropertyOptional({
    type: [LevelResultDto],
    description: 'Level results. A later result for a levelId replaces the earlier one.',
  })
  readonly results?: LevelResultDto[];
}

// The one progress entry of a user for one gameId (API-FR-02).
export class ProgressDto {
  @ApiProperty({ example: 'hexa-lines' })
  readonly gameId!: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 120,
    description: 'The highest score, or null when no sync sent a score.',
  })
  readonly highScore!: number | null;

  @ApiProperty({ format: 'date-time', example: '2026-11-06T10:00:00.000Z' })
  readonly updatedAt!: string;

  @ApiProperty({ type: [LevelResultDto] })
  readonly results!: LevelResultDto[];
}
