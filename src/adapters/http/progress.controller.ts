import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
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
  GET_PROGRESS,
  type GetProgress,
} from '../../application/progress/get-progress.use-case.js';
import type { ProgressProblem } from '../../application/progress/progress-problem.js';
import {
  SYNC_PROGRESS,
  type SyncProgress,
} from '../../application/progress/sync-progress.use-case.js';
import { receiveLevelResultOf, receiveValueOf } from '../received.js';
import { ErrorDto } from './error.dto.js';
import { type AuthenticatedRequest, JwtAuthGuard } from './jwt-auth.guard.js';
import { ProgressDtoMapper } from './progress-dto.mapper.js';
import { ProgressDto, SyncProgressDto } from './progress.dto.js';

const UNAUTHORIZED = {
  type: ErrorDto,
  description: 'The bearer token is missing, malformed, expired or signed with another key.',
};

// Progress sync and read, one entry per user and gameId (API-FR-02). Both
// routes are behind JwtAuthGuard, and the userId comes from the token.
// ProgressDtoMapper builds the request of each use case. A request that the
// mapper rejects and a failed Result become an HttpException, and
// HttpErrorFilter answers it with ErrorDto (API-FR-06).
@ApiTags('progress')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('progress')
export class ProgressController {
  constructor(
    @Inject(SYNC_PROGRESS) private readonly syncProgress: SyncProgress,
    @Inject(GET_PROGRESS) private readonly getProgress: GetProgress,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ProgressDto, description: 'The progress entry after the sync.' })
  @ApiBadRequestResponse({
    type: ErrorDto,
    description:
      'A field is missing or breaks its rule, the API holds no level of a result, or a result carries more stars than its level has star thresholds.',
  })
  @ApiUnauthorizedResponse(UNAUTHORIZED)
  async sync(
    @Body() body: SyncProgressDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ProgressDto> {
    const syncRequest = ProgressDtoMapper.toRequest(body, request.userId);
    if (!syncRequest.ok) {
      throw new BadRequestException(syncRequest.error);
    }
    const result = await this.syncProgress.execute(syncRequest.value);
    if (!result.ok) {
      throw httpErrorOf(result.error, body.gameId);
    }
    return ProgressDtoMapper.toDto(result.value);
  }

  @Get(':gameId')
  @ApiOkResponse({ type: ProgressDto, description: 'The progress entry of the gameId.' })
  @ApiBadRequestResponse({ type: ErrorDto, description: 'The gameId breaks its rule.' })
  @ApiUnauthorizedResponse(UNAUTHORIZED)
  @ApiNotFoundResponse({ type: ErrorDto, description: 'The user has no progress for the gameId.' })
  async read(
    @Param('gameId') gameId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<ProgressDto> {
    const getRequest = ProgressDtoMapper.toGetRequest(gameId, request.userId);
    if (!getRequest.ok) {
      throw new BadRequestException(getRequest.error);
    }
    const result = await this.getProgress.execute(getRequest.value);
    if (!result.ok) {
      throw httpErrorOf(result.error, gameId);
    }
    return ProgressDtoMapper.toDto(result.value);
  }
}

// A value that breaks its rule stops in ProgressDtoMapper, before any use
// case. The use cases fail on a missing progress, or on a result that its
// level does not admit (#135). A result of the wrong level breaks the body,
// not the route, so it answers 400 with one detail, as a broken value does.
function httpErrorOf(problem: ProgressProblem, gameId: string): Error {
  switch (problem.kind) {
    case 'progress-not-found':
      return new NotFoundException(`No progress for gameId ${gameId}`);
    case 'unknown-level': {
      const { levelId } = receiveLevelResultOf(problem.result);
      return new BadRequestException([`No level ${levelId} for gameId ${gameId}.`]);
    }
    case 'too-many-stars': {
      const { levelId, stars } = receiveLevelResultOf(problem.result);
      const most = receiveValueOf(problem.most);
      return new BadRequestException([
        `stars of level ${levelId} must be at most ${most}, the count of its star thresholds, got ${stars}.`,
      ]);
    }
  }
}
