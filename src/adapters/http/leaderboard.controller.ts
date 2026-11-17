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
  GET_LEADERBOARD,
  type GetLeaderboard,
  type LeaderboardQuery,
  type UnknownLevel,
} from '../../application/leaderboard/get-leaderboard.use-case.js';
import type { Result } from '../../domain/shared/result.js';
import { receiveValueOf } from '../received.js';
import { ErrorDto } from './error.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { LeaderboardDtoMapper } from './leaderboard-dto.mapper.js';
import {
  GlobalLeaderboardDto,
  type LeaderboardDto,
  LevelLeaderboardDto,
} from './leaderboard.dto.js';

const UNAUTHORIZED = {
  type: ErrorDto,
  description: 'The bearer token is missing, malformed, expired or signed with another key.',
};

// The leaderboards of one gameId (API-FR-03): both global boards, and the
// board of one level. Both routes are behind JwtAuthGuard (S3-09, a proposal
// on #76). LeaderboardDtoMapper builds the query and the answer. A path value
// that the mapper rejects becomes a 400, and a level that the definitions
// do not hold becomes a 404 (#146). HttpErrorFilter answers both with
// ErrorDto (API-FR-06). A board has no page size (decision of #83).
@ApiTags('leaderboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('leaderboard')
export class LeaderboardController {
  constructor(@Inject(GET_LEADERBOARD) private readonly getLeaderboard: GetLeaderboard) {}

  @Get(':gameId')
  @ApiOkResponse({
    type: GlobalLeaderboardDto,
    description: 'The score board and the standing board of the gameId.',
  })
  @ApiBadRequestResponse({ type: ErrorDto, description: 'The gameId breaks its rule.' })
  @ApiUnauthorizedResponse(UNAUTHORIZED)
  top(@Param('gameId') gameId: string): Promise<LeaderboardDto> {
    return this.answer(LeaderboardDtoMapper.toGlobalQuery(gameId));
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
  topOfLevel(
    @Param('gameId') gameId: string,
    @Param('levelId') levelId: string,
  ): Promise<LeaderboardDto> {
    return this.answer(LeaderboardDtoMapper.toLevelQuery(gameId, levelId));
  }

  private async answer(query: Result<LeaderboardQuery, string[]>): Promise<LeaderboardDto> {
    if (!query.ok) {
      throw new BadRequestException(query.error);
    }
    const result = await this.getLeaderboard.execute(query.value);
    if (!result.ok) {
      throw httpErrorOf(result.error, query.value);
    }
    return LeaderboardDtoMapper.toDto(result.value);
  }
}

// A path value that breaks its rule stops in LeaderboardDtoMapper, before
// the use case. So the one expected failure of the use case is a level that
// the definitions do not hold (#146). Only a level query fails so, but the
// message names the gameId of any query.
function httpErrorOf(problem: UnknownLevel, query: LeaderboardQuery): Error {
  switch (problem.kind) {
    case 'unknown-level': {
      const gameId = receiveValueOf(query.gameId);
      const levelId = query.board === 'level' ? ` ${receiveValueOf(query.levelId)}` : '';
      return new NotFoundException(`No level${levelId} for gameId ${gameId}`);
    }
  }
}
