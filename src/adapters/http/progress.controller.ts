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
import { ErrorDto } from './error.dto.js';
import { type AuthenticatedRequest, JwtAuthGuard } from './jwt-auth.guard.js';
import { ProgressDtoMapper } from './progress-dto.mapper.js';
import { ProgressDto, SyncProgressDto } from './progress.dto.js';

const UNAUTHORIZED = {
  type: ErrorDto,
  description: 'The bearer token is missing, malformed, expired or signed with another key.',
};

// Progress sync and read, one entry per user and gameId (API-FR-02). Both
// routes are behind JwtAuthGuard, and the userId comes from the token. A
// failed Result becomes an HttpException, and HttpErrorFilter answers it
// with ErrorDto (API-FR-06).
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
  @ApiBadRequestResponse({ type: ErrorDto, description: 'A field is missing or breaks its rule.' })
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
      throw httpErrorOf(result.error, syncRequest.value.gameId);
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
    const result = await this.getProgress.execute({ userId: request.userId, gameId });
    if (!result.ok) {
      throw httpErrorOf(result.error, gameId);
    }
    return ProgressDtoMapper.toDto(result.value);
  }
}

function httpErrorOf(problem: ProgressProblem, gameId: string): Error {
  return problem.kind === 'progress-not-found'
    ? new NotFoundException(`No progress for gameId ${gameId}`)
    : new BadRequestException(problem.problems);
}
