import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { LOGIN, type Login } from '../../application/auth/login.use-case.js';
import {
  REGISTER_USER,
  type RegisterProblem,
  type RegisterUser,
} from '../../application/auth/register.use-case.js';
import { AuthDtoMapper, type SignInProblem } from './auth-dto.mapper.js';
import { CredentialsDto } from './credentials.dto.js';
import { CurrentUserDto } from './current-user.dto.js';
import { ErrorDto } from './error.dto.js';
import { type AuthenticatedRequest, JwtAuthGuard } from './jwt-auth.guard.js';
import { LoginDto } from './login.dto.js';
import { RATE_LIMIT_HEADERS } from './rate-limit.headers.js';
import { TokenDto } from './token.dto.js';
import { TOO_MANY_REQUESTS } from './too-many-requests.response.js';
import { UNAUTHORIZED } from './unauthorized.response.js';

// Sign-up, sign-in and the signed-in user (API-FR-01). Sign-up and sign-in
// have no token guard, because the player has no token yet. GET /auth/me
// has the guard. ThrottlerGuard limits the requests of each client to
// sign-up and to sign-in, so a client cannot spend the CPU of the scrypt hash
// without bound (#170). A request over the limit answers 429 before the
// use case runs. AppModule reads the limit from the configuration. AuthDtoMapper builds the request of each use case and each
// answer, so the controller holds no translation code (decision 12). A
// request that the mapper rejects and a failed Result become an
// HttpException, and HttpErrorFilter answers it with ErrorDto (API-FR-06).
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(REGISTER_USER) private readonly register: RegisterUser,
    @Inject(LOGIN) private readonly login: Login,
  ) {}

  @Post('register')
  @UseGuards(ThrottlerGuard)
  @ApiCreatedResponse({
    description: 'The user exists. The body is empty.',
    headers: RATE_LIMIT_HEADERS,
  })
  @ApiBadRequestResponse({
    type: ErrorDto,
    description: 'A field is missing or breaks its rule.',
    headers: RATE_LIMIT_HEADERS,
  })
  @ApiConflictResponse({
    type: ErrorDto,
    headers: RATE_LIMIT_HEADERS,
    description: 'Another user has this username, or one that differs only in letter case.',
  })
  @ApiTooManyRequestsResponse(TOO_MANY_REQUESTS)
  async signUp(@Body() body: CredentialsDto): Promise<void> {
    const request = AuthDtoMapper.toRegisterRequest(body);
    if (!request.ok) {
      throw new BadRequestException(request.error);
    }
    const result = await this.register.execute(request.value);
    if (!result.ok) {
      throw signUpErrorOf(result.error);
    }
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @ApiOkResponse({
    type: TokenDto,
    description: 'The credentials are valid.',
    headers: RATE_LIMIT_HEADERS,
  })
  @ApiBadRequestResponse({
    type: ErrorDto,
    description: 'A field is missing or is not a string.',
    headers: RATE_LIMIT_HEADERS,
  })
  @ApiUnauthorizedResponse({
    type: ErrorDto,
    headers: RATE_LIMIT_HEADERS,
    description: 'The username or the password is wrong.',
  })
  @ApiTooManyRequestsResponse(TOO_MANY_REQUESTS)
  async signIn(@Body() body: LoginDto): Promise<TokenDto> {
    const request = AuthDtoMapper.toLoginRequest(body);
    if (!request.ok) {
      throw signInErrorOf(request.error);
    }
    const result = await this.login.execute(request.value);
    if (!result.ok) {
      throw signInErrorOf(result.error);
    }
    return AuthDtoMapper.toTokenDto(result.value);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ type: CurrentUserDto, description: 'The token is valid.' })
  @ApiUnauthorizedResponse(UNAUTHORIZED)
  me(@Req() request: AuthenticatedRequest): CurrentUserDto {
    return AuthDtoMapper.toCurrentUserDto(request.userId);
  }
}

// A value that breaks its rule stops in AuthDtoMapper, before any use case.
// So the one expected failure of sign-up is a taken name.
function signUpErrorOf(problem: RegisterProblem): Error {
  switch (problem.kind) {
    case 'username-taken':
      return new ConflictException('Username is already taken');
  }
}

// Sign-in has one way to fail for bad credentials. The mapper gives it for
// a username that breaks its rule, and LoginUseCase gives it for an unknown
// username, a wrong password and a text longer than any password. Each one
// gets the same 401.
function signInErrorOf(problem: SignInProblem): Error {
  switch (problem.kind) {
    case 'invalid-body':
      return new BadRequestException(problem.problems);
    case 'invalid-credentials':
      return new UnauthorizedException('Invalid username or password');
  }
}
