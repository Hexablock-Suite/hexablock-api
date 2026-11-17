import { ApiExtraModels, ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';
import { INCOMING_ID_BOUNDS } from './progress-values.js';

// The DTOs of the level routes (API-FR-04). Each one is a part of the shared
// level format of S3-02, field for field (docs/level-format.md). They give
// the OpenAPI schema that the client generates its types from. The API does
// not check a body against them: LevelDtoMapper builds the values of the
// common part, and the strategy of the gameId reads the section (#77).

// A coordinate is a list of whole numbers. The topology says how to read it.
const CELL = { type: 'array', items: { type: 'integer' } } as const;
const CELLS = { type: 'array', items: CELL } as const;

// One piece of a Fit level. Its cells are relative to its origin.
export class FitPieceDto {
  @ApiProperty({ example: 'a', description: 'A non-blank text, unique in the level.' })
  readonly id!: string;

  @ApiProperty({
    ...CELLS,
    example: [
      [0, 0],
      [1, 0],
    ],
  })
  readonly cells!: number[][];
}

// One entry of the witness of A5: it turns a piece and moves it.
export class FitPlacementDto {
  @ApiProperty({ example: 'b', description: 'The id of a piece of the level.' })
  readonly piece!: string;

  @ApiProperty({
    type: 'integer',
    example: 1,
    description: 'Rotation steps of the topology. A negative count turns the other way.',
  })
  readonly rotation!: number;

  @ApiProperty({ ...CELL, example: [2, 0] })
  readonly at!: number[];
}

// One star threshold of a Fit level. A Fit star needs both limits.
export class FitStarDto {
  @ApiProperty({ type: 'integer', minimum: 0, example: 12 })
  readonly maxMoves!: number;

  @ApiProperty({ type: 'integer', minimum: 0, example: 120000 })
  readonly maxElapsedMs!: number;
}

// The section of a Fit level.
export class FitSectionDto {
  @ApiProperty({
    ...CELLS,
    example: [
      [0, 0],
      [1, 0],
    ],
    description: 'The cells that the player covers.',
  })
  readonly figure!: number[][];

  @ApiProperty({ type: [FitPieceDto] })
  readonly pieces!: FitPieceDto[];

  @ApiProperty({
    type: [FitPlacementDto],
    description: 'The solution of the designer. It covers the figure exactly (A5).',
  })
  readonly witness!: FitPlacementDto[];

  @ApiProperty({ type: [FitStarDto], description: 'The star thresholds, from the first star up.' })
  readonly stars!: FitStarDto[];
}

// A seeded piece source of a Sort level.
export class SeededSourceDto {
  @ApiProperty({ type: 'integer', minimum: 0, maximum: 4294967295, example: 20261115 })
  readonly seed!: number;

  @ApiProperty({ type: [String], example: ['red', 'green', 'blue'] })
  readonly colors!: string[];
}

// A fixed piece source of a Sort level. A stack lists its colors from the
// bottom tile to the top tile.
export class FixedSourceDto {
  @ApiProperty({
    type: 'array',
    items: { type: 'array', items: { type: 'string' } },
    example: [['red', 'red', 'blue'], ['green']],
  })
  readonly stacks!: string[][];
}

// One star threshold of a Sort level.
export class SortStarDto {
  @ApiProperty({ type: 'integer', minimum: 0, example: 40 })
  readonly maxMoves!: number;
}

// The section of a Sort level.
@ApiExtraModels(SeededSourceDto, FixedSourceDto)
export class SortSectionDto {
  @ApiProperty({ type: 'integer', minimum: 1, example: 2 })
  readonly radius!: number;

  @ApiProperty({
    type: 'integer',
    minimum: 1,
    example: 3,
    description: 'The count of stacks to clear.',
  })
  readonly goals!: number;

  @ApiProperty({
    oneOf: [{ $ref: getSchemaPath(SeededSourceDto) }, { $ref: getSchemaPath(FixedSourceDto) }],
  })
  readonly source!: SeededSourceDto | FixedSourceDto;

  @ApiProperty({ type: [SortStarDto], description: 'The star thresholds, from the first star up.' })
  readonly stars!: SortStarDto[];
}

// One level: the common part of DS-6 and the section of its game.
@ApiExtraModels(FitSectionDto, SortSectionDto)
export class LevelDto {
  @ApiProperty({
    example: 'hexa-fit',
    pattern: '^[a-z][a-z0-9-]*$',
    minLength: INCOMING_ID_BOUNDS.min,
    maxLength: INCOMING_ID_BOUNDS.max,
    description: 'The game variant: hexa-fit or hexa-sort. Another game has no level files.',
  })
  readonly gameId!: string;

  @ApiProperty({
    example: 'fit-01',
    minLength: INCOMING_ID_BOUNDS.min,
    maxLength: INCOMING_ID_BOUNDS.max,
    description:
      'A non-blank text, unique in its game, with no control character (U+0000 to U+001F, U+007F).',
  })
  readonly levelId!: string;

  @ApiProperty({
    type: 'integer',
    minimum: 1,
    example: 1,
    description: 'The place of the level in the list of its game.',
  })
  readonly order!: number;

  @ApiProperty({
    type: 'integer',
    minimum: 1,
    example: 1,
    description:
      'The copy of the level. The update rejects a version lower than the stored one, and accepts an equal or a higher one (S3-10).',
  })
  readonly version!: number;

  @ApiProperty({
    example: 'hex',
    pattern: '^[a-z][a-z0-9-]*$',
    description: 'How to read the coordinates, such as hex.',
  })
  readonly topology!: string;

  @ApiProperty({
    oneOf: [{ $ref: getSchemaPath(FitSectionDto) }, { $ref: getSchemaPath(SortSectionDto) }],
    description: 'The section of the game: the Fit section or the Sort section.',
  })
  readonly section!: FitSectionDto | SortSectionDto;
}

// A stored level that breaks a rule (#147). The read names it, so the
// client can show it as not available. It gives no section.
export class UnavailableLevelDto {
  @ApiProperty({ example: 'hexa-fit', description: 'The gameId of the stored level.' })
  readonly gameId!: string;

  @ApiProperty({ example: 'fit-01', description: 'The levelId of the stored level.' })
  readonly levelId!: string;

  @ApiProperty({
    example: 'invalid-section',
    description:
      'The code of the first rule that the stored level breaks, as docs/level-format.md names it.',
  })
  readonly reason!: string;
}

// The body of PUT /levels and the answer of GET /levels. The update reads
// only levels.
export class LevelsDto {
  @ApiProperty({
    type: [LevelDto],
    description: 'The levels, by gameId and then by levelId in an answer.',
  })
  readonly levels!: LevelDto[];

  @ApiPropertyOptional({
    type: [UnavailableLevelDto],
    description:
      'Only in an answer, and only when a stored level breaks a rule: each such level, by gameId and then by levelId. The levels field holds every other level. The update ignores this field.',
  })
  readonly unavailable?: UnavailableLevelDto[];
}
