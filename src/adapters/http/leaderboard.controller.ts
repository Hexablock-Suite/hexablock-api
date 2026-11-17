import { BadRequestException, Controller, Get, Inject, Param, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  GET_LEADERBOARD,
  type GetLeaderboard,
  type LeaderboardQuery,
} from '../../application/leaderboard/get-leaderboard.use-case.js';
import type { Result } from '../../domain/shared/result.js';
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
  description:
    'The bearer token is missing, malformed, expired, signed with another key or names a user that is not stored.',
};

// The leaderboards of one gameId (API-FR-03): both global boards, and the
// board of one level. Both routes are behind JwtAuthGuard (S3-09, a proposal
// on #76). LeaderboardDtoMapper builds the query and the answer. A path value
// that the mapper rejects becomes a 400, and HttpErrorFilter answers it with
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
    // GetLeaderboard has no expected failure: its error type is never.
    if (!result.ok) {
      return result.error;
    }
    return LeaderboardDtoMapper.toDto(result.value);
  }
}
