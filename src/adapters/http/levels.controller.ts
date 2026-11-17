import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { GET_LEVELS, type GetLevels } from '../../application/levels/get-levels.use-case.js';
import {
  UPDATE_LEVELS,
  type UpdateLevels,
} from '../../application/levels/update-levels.use-case.js';
import { ErrorDto } from './error.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { LevelDtoMapper } from './level-dto.mapper.js';
import { LevelsDto } from './level.dto.js';

// The level definitions of Fit and Sort (API-FR-04). The read has no guard,
// and one call gives every level. The update is behind JwtAuthGuard: the
// token guard is the only check, with no roles (Q4). It is an idempotent
// batch, so a retry of the same batch is safe (S3-10). LevelDtoMapper builds
// the request and the answer. A request that the mapper rejects and a failed
// Result become a 400, and HttpErrorFilter answers it with ErrorDto
// (API-FR-06). Each detail of that body names one level by its gameId and
// its levelId.
@ApiTags('levels')
@Controller('levels')
export class LevelsController {
  constructor(
    @Inject(GET_LEVELS) private readonly getLevels: GetLevels,
    @Inject(UPDATE_LEVELS) private readonly updateLevels: UpdateLevels,
  ) {}

  @Get()
  @ApiOkResponse({ type: LevelsDto, description: 'Every stored level, by gameId and levelId.' })
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
  @ApiNoContentResponse({ description: 'Every level of the batch is saved. The body is empty.' })
  @ApiBadRequestResponse({
    type: ErrorDto,
    description:
      'The body has the wrong shape, or a level breaks a rule: a value of the common part, its section, A5, a lower version than the stored one, or a gameId with no level files. Each detail names one level by its gameId and levelId. A level problem saves no level of the batch, except a lower version, which saves the other levels.',
  })
  @ApiUnauthorizedResponse({
    type: ErrorDto,
    description:
      'The bearer token is missing, malformed, expired, signed with another key or names a user that is not stored.',
  })
  async update(@Body() body: LevelsDto): Promise<void> {
    const request = LevelDtoMapper.toRequest(body);
    if (!request.ok) {
      throw new BadRequestException(request.error);
    }
    const result = await this.updateLevels.execute(request.value);
    if (!result.ok) {
      throw new BadRequestException(LevelDtoMapper.toDetails(result.error.problems));
    }
  }
}
