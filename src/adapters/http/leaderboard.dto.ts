import { ApiProperty } from '@nestjs/swagger';

const RANK = {
  example: 1,
  minimum: 1,
  description:
    '1 plus the number of rows that are strictly better. A full tie shares a rank, and the next rank skips: 1, 1, 3.',
};

const USER_ID = {
  example: '0b6f6a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b',
  description: 'The player. A full tie lists its players by userId ascending.',
};

const USERNAME = {
  example: 'ada',
  description:
    'The username of the account of the player, as the player typed it at sign-up (#230).',
};

// One row of the board of a level: the stored result of one player (DS-4,
// DS-12).
export class LevelEntryDto {
  @ApiProperty(RANK)
  readonly rank!: number;

  @ApiProperty(USER_ID)
  readonly userId!: string;

  @ApiProperty(USERNAME)
  readonly username!: string;

  @ApiProperty({ example: 3, minimum: 0 })
  readonly stars!: number;

  @ApiProperty({ example: 12, minimum: 0 })
  readonly moves!: number;

  @ApiProperty({ example: 45000, minimum: 0 })
  readonly elapsedMs!: number;
}

// One row of the score board of a game: the high score of one player.
export class ScoreEntryDto {
  @ApiProperty(RANK)
  readonly rank!: number;

  @ApiProperty(USER_ID)
  readonly userId!: string;

  @ApiProperty(USERNAME)
  readonly username!: string;

  @ApiProperty({ example: 2048, minimum: 0 })
  readonly highScore!: number;
}

// One row of the standing board of a game: the totals of the stored level
// results of one player (S3-03).
export class StandingEntryDto {
  @ApiProperty(RANK)
  readonly rank!: number;

  @ApiProperty(USER_ID)
  readonly userId!: string;

  @ApiProperty(USERNAME)
  readonly username!: string;

  @ApiProperty({ example: 9, minimum: 0, description: 'The total of the stars.' })
  readonly stars!: number;

  @ApiProperty({
    example: 3,
    minimum: 1,
    description: 'The number of levels with a stored result.',
  })
  readonly levelsCompleted!: number;

  @ApiProperty({ example: 40, minimum: 0, description: 'The total of the moves.' })
  readonly moves!: number;

  @ApiProperty({ example: 90000, minimum: 0, description: 'The total of the elapsed time.' })
  readonly elapsedMs!: number;
}

// The answer of GET /leaderboard/{gameId}: both global boards of the game
// (API-FR-03). Each board lists only the players who have a result to rank.
export class GlobalLeaderboardDto {
  @ApiProperty({ example: 'hexa-lines' })
  readonly gameId!: string;

  @ApiProperty({
    type: [ScoreEntryDto],
    description:
      'The high scores, the higher score first. Empty for a game that keeps no score, such as Fit and Sort.',
  })
  readonly highScores!: ScoreEntryDto[];

  @ApiProperty({
    type: [StandingEntryDto],
    description:
      'The totals of the level results: more stars first, then more levels completed, then fewer moves, then less time. Empty for a game with no level results, such as Lines and Merge.',
  })
  readonly standings!: StandingEntryDto[];
}

// The answer of GET /leaderboard/{gameId}/levels/{levelId}: the board of one
// level (API-FR-03).
export class LevelLeaderboardDto {
  @ApiProperty({ example: 'hexa-fit' })
  readonly gameId!: string;

  @ApiProperty({ example: 'fit-01' })
  readonly levelId!: string;

  @ApiProperty({
    type: [LevelEntryDto],
    description: 'More stars first, then fewer moves, then less time (DS-4).',
  })
  readonly entries!: LevelEntryDto[];
}
