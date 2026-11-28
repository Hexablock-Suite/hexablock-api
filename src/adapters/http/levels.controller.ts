import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { GET_LEVELS, type GetLevels } from '../../application/levels/get-levels.use-case.js';
import {
  UPDATE_LEVELS,
  type UpdateLevels,
  type UpdateLevelsError,
} from '../../application/levels/update-levels.use-case.js';
import { ErrorDto } from './error.dto.js';
import { type AuthenticatedRequest, JwtAuthGuard } from './jwt-auth.guard.js';
import { LevelDtoMapper } from './level-dto.mapper.js';
import { LevelsDto } from './level.dto.js';
import { UNAUTHORIZED } from './unauthorized.response.js';

// The level definitions of Fit and Sort (API-FR-04). The read has no guard,
// and one call gives every level. A stored level that breaks a rule hides no
// other level: the read names it in unavailable (#147). The update is behind
// JwtAuthGuard. Only an account in the list of level editors of the
// configuration may update, with no roles (Q4, #145): AuthorizationAspect
// checks the UserId of the request inside the UpdateLevels port (#180). It
// is an idempotent batch, so a retry of the same batch is safe (S3-10).
// LevelDtoMapper builds the request and the answer. A request that the
// mapper rejects becomes a 400 for any account, because the mapper runs
// before the aspect (option A of 2026-11-28). A failed Result of kind
// not-a-level-editor becomes a 403, and one of kind invalid-levels a 400.
// HttpErrorFilter answers each one with ErrorDto (API-FR-06). Each detail of
// a 400 of invalid-levels names one level by its gameId and its levelId.
@ApiTags('levels')
@Controller('levels')
export class LevelsController {
  constructor(
    @Inject(GET_LEVELS) private readonly getLevels: GetLevels,
    @Inject(UPDATE_LEVELS) private readonly updateLevels: UpdateLevels,
  ) {}

  @Get()
  @ApiOkResponse({
    type: LevelsDto,
    description:
      'Every stored level, by gameId and levelId. A stored level that breaks a rule is not in levels: unavailable names it with the code of its rule.',
  })
  async list(): Promise<LevelsDto> {
    const result = await this.getLevels.execute();
    // GetLevels has no expected failure: its error type is never.
    if (!result.ok) {
      return result.error;
    }
    return LevelDtoMapper.toLevelsDto(result.value);
  }

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiNoContentResponse({
    description:
      'Every level of the batch is saved. A level replaces a stored level that breaks a rule. The body is empty.',
  })
  @ApiBadRequestResponse({
    type: ErrorDto,
    description:
      'The body has the wrong shape, or a level breaks a rule: a value of the common part, its section, A5, a lower version than the stored one, or a gameId with no level files. Over a stored level that breaks a rule, a lower version than its stored version is rejected too, when that stored version is valid. Each detail names one level by its gameId and levelId. The detail of a level problem ends with its code: `invalid-order`, `invalid-version`, `invalid-topology`, `game-without-levels`, `unknown-topology`, `invalid-section`, `invalid-figure`, `invalid-pieces`, `invalid-witness`, `invalid-stars`, `unequal-area`, `inexact-witness`, `invalid-radius`, `invalid-goals`, `invalid-source` or `older-version`, as docs/level-format.md lists them. A level problem saves no level of the batch, except a lower version, which saves the other levels.',
  })
  @ApiUnauthorizedResponse(UNAUTHORIZED)
  @ApiForbiddenResponse({
    type: ErrorDto,
    description:
      'The account of the token is not in the list of level editors of the configuration. An empty or unset list lets no account update. No level is saved.',
  })
  async update(@Body() body: LevelsDto, @Req() request: AuthenticatedRequest): Promise<void> {
    const updateRequest = LevelDtoMapper.toRequest(body, request.userId);
    if (!updateRequest.ok) {
      throw new BadRequestException(updateRequest.error);
    }
    const result = await this.updateLevels.execute(updateRequest.value);
    if (!result.ok) {
      throw updateErrorOf(result.error);
    }
  }
}

// Each expected failure of the update has its own status. The 403 keeps the
// message of #145, so a client sees the same answer as before #180.
function updateErrorOf(problem: UpdateLevelsError): Error {
  switch (problem.kind) {
    case 'not-a-level-editor':
      return new ForbiddenException('This account may not update levels');
    case 'invalid-levels':
      return new BadRequestException(LevelDtoMapper.toDetails(problem.problems));
  }
}
