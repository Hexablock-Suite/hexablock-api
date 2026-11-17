import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { INCOMING_ID_BOUNDS, MOST_MOVES, MOST_STARS } from './progress-values.js';

// The result of one level (DS-5). The limits of a sync come from the domain
// (#135): progress-values.ts receives them.
export class LevelResultDto {
  @ApiProperty({
    example: 'fit-01',
    minLength: INCOMING_ID_BOUNDS.min,
    maxLength: INCOMING_ID_BOUNDS.max,
    description: 'A non-blank text with no control character (U+0000 to U+001F, U+007F).',
  })
  readonly levelId!: string;

  @ApiProperty({
    example: 3,
    minimum: 0,
    maximum: MOST_STARS,
    description: 'A non-negative integer that fits the integer column of the store.',
  })
  readonly stars!: number;

  @ApiProperty({
    example: 12,
    minimum: 0,
    maximum: MOST_MOVES,
    description: 'A non-negative integer that fits the integer column of the store.',
  })
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
    minLength: INCOMING_ID_BOUNDS.min,
    maxLength: INCOMING_ID_BOUNDS.max,
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
    description:
      'Level results. For each levelId the better result stays: more stars, then fewer moves, then less time; on a full tie the stored result stays.',
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
