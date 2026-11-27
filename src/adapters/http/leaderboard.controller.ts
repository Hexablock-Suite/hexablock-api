import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  GET_GLOBAL_LEADERBOARD,
  type GetGlobalLeaderboard,
} from '../../application/leaderboard/get-global-leaderboard.use-case.js';
import {
  GET_LEVEL_LEADERBOARD,
  type GetLevelLeaderboard,
  type LevelBoardQuery,
  type UnknownLevel,
} from '../../application/leaderboard/get-level-leaderboard.use-case.js';
import { receiveValueOf } from '../received.js';
import { ErrorDto } from './error.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { LeaderboardDtoMapper } from './leaderboard-dto.mapper.js';
import { GlobalLeaderboardDto, LevelLeaderboardDto } from './leaderboard.dto.js';

const UNAUTHORIZED = {
  type: ErrorDto,
  description:
    'The bearer token is missing, malformed, expired, signed with another key or names a user that is not stored.',
};

// The leaderboards of one gameId (API-FR-03): both global boards, and the
// board of one level. Each route calls its own input port (#218). Both
// routes are behind JwtAuthGuard (S3-09, a proposal on #76).
// LeaderboardDtoMapper builds each request and each answer. A path value
// that the mapper rejects becomes a 400, and a level that the definitions
// do not hold becomes a 404 (#146). HttpErrorFilter answers both with
// ErrorDto (API-FR-06). A board has no page size (decision of #83).
@ApiTags('leaderboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('leaderboard')
export class LeaderboardController {
  constructor(
    @Inject(GET_GLOBAL_LEADERBOARD) private readonly getGlobalLeaderboard: GetGlobalLeaderboard,
    @Inject(GET_LEVEL_LEADERBOARD) private readonly getLevelLeaderboard: GetLevelLeaderboard,
  ) {}

  @Get(':gameId')
  @ApiOkResponse({
    type: GlobalLeaderboardDto,
    description: 'The score board and the standing board of the gameId.',
  })
  @ApiBadRequestResponse({ type: ErrorDto, description: 'The gameId breaks its rule.' })
  @ApiUnauthorizedResponse(UNAUTHORIZED)
  async top(@Param('gameId') gameId: string): Promise<GlobalLeaderboardDto> {
    const request = LeaderboardDtoMapper.toGlobalQuery(gameId);
    if (!request.ok) {
      throw new BadRequestException(request.error);
    }
    const result = await this.getGlobalLeaderboard.execute(request.value);
    // GetGlobalLeaderboard has no expected failure: its error type is never.
    if (!result.ok) {
      return result.error;
    }
    return LeaderboardDtoMapper.toGlobalDto(result.value);
  }

  @Get(':gameId/levels/:levelId')
  @ApiOkResponse({ type: LevelLeaderboardDto, description: 'The board of one level.' })
  @ApiBadRequestResponse({
    type: ErrorDto,
    description: 'The gameId or the levelId breaks its rule.',
  })
  @ApiUnauthorizedResponse(UNAUTHORIZED)
  @ApiNotFoundResponse({
    type: ErrorDto,
    description: 'The level definitions do not hold the levelId for the gameId.',
  })
  async topOfLevel(
    @Param('gameId') gameId: string,
    @Param('levelId') levelId: string,
  ): Promise<LevelLeaderboardDto> {
    const query = LeaderboardDtoMapper.toLevelQuery(gameId, levelId);
    if (!query.ok) {
      throw new BadRequestException(query.error);
    }
    const result = await this.getLevelLeaderboard.execute(query.value);
    if (!result.ok) {
      throw httpErrorOf(result.error, query.value);
    }
    return LeaderboardDtoMapper.toLevelDto(result.value);
  }
}

// A path value that breaks its rule stops in LeaderboardDtoMapper, before
// the use case. So the one expected failure of the use case is a level that
// the definitions do not hold (#146).
function httpErrorOf(problem: UnknownLevel, query: LevelBoardQuery): Error {
  switch (problem.kind) {
    case 'unknown-level': {
      const gameId = receiveValueOf(query.gameId);
      const levelId = receiveValueOf(query.levelId);
      return new NotFoundException(`No level ${levelId} for gameId ${gameId}`);
    }
  }
}
