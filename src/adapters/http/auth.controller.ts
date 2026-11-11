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
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { CredentialField, Credentials } from '../../application/auth/credentials.js';
import { LOGIN, type Login } from '../../application/auth/login.use-case.js';
import { REGISTER_USER, type RegisterUser } from '../../application/auth/register.use-case.js';
import { PASSWORD_LENGTH } from '../../domain/user/password.js';
import { USERNAME_LENGTH } from '../../domain/user/username.js';
import { receiveBoundsOf, receiveValueOf } from '../received.js';
import { CredentialsDto } from './credentials.dto.js';
import { CurrentUserDto } from './current-user.dto.js';
import { ErrorDto } from './error.dto.js';
import { type AuthenticatedRequest, JwtAuthGuard } from './jwt-auth.guard.js';
import { LoginDto } from './login.dto.js';
import { TokenDto } from './token.dto.js';

// The messages name the limits that the domain ranges deliver.
const USERNAME_BOUNDS = receiveBoundsOf(USERNAME_LENGTH);
const PASSWORD_BOUNDS = receiveBoundsOf(PASSWORD_LENGTH);

const RULES: Record<CredentialField, string> = {
  username: `username must have ${USERNAME_BOUNDS.min} to ${USERNAME_BOUNDS.max} characters: letters, digits, dots, hyphens or underscores`,
  password: `password must have ${PASSWORD_BOUNDS.min} to ${PASSWORD_BOUNDS.max} characters`,
};

// Sign-up, sign-in and the signed-in user (API-FR-01). Sign-up and sign-in
// have no token guard, because the player has no token yet. GET /auth/me
// has the guard. A failed Result becomes an HttpException, and
// HttpErrorFilter answers it with ErrorDto (API-FR-06).
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(REGISTER_USER) private readonly register: RegisterUser,
    @Inject(LOGIN) private readonly login: Login,
  ) {}

  @Post('register')
  @ApiCreatedResponse({ description: 'The user exists. The body is empty.' })
  @ApiBadRequestResponse({ type: ErrorDto, description: 'A field is missing or breaks its rule.' })
  @ApiConflictResponse({
    type: ErrorDto,
    description: 'Another user has this username, or one that differs only in letter case.',
  })
  async signUp(@Body() body: CredentialsDto): Promise<void> {
    const result = await this.register.execute(credentialsFrom(body));
    if (result.ok) {
      return;
    }
    if (result.error.kind === 'username-taken') {
      throw new ConflictException('Username is already taken');
    }
    throw new BadRequestException(result.error.fields.map((field) => RULES[field]));
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: TokenDto, description: 'The credentials are valid.' })
  @ApiBadRequestResponse({ type: ErrorDto, description: 'A field is missing or is not a string.' })
  @ApiUnauthorizedResponse({
    type: ErrorDto,
    description: 'The username or the password is wrong.',
  })
  async signIn(@Body() body: LoginDto): Promise<TokenDto> {
    const result = await this.login.execute(credentialsFrom(body));
    if (!result.ok) {
      throw new UnauthorizedException('Invalid username or password');
    }
    return { accessToken: result.value };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ type: CurrentUserDto, description: 'The token is valid.' })
  @ApiUnauthorizedResponse({
    type: ErrorDto,
    description: 'The bearer token is missing, malformed, expired or signed with another key.',
  })
  me(@Req() request: AuthenticatedRequest): CurrentUserDto {
    return { userId: receiveValueOf(request.userId) };
  }
}

// The app has no validation pipe, so the controller checks the body shape.
function credentialsFrom(body: unknown): Credentials {
  const fields = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const { username, password } = fields;
  const problems: string[] = [];
  if (typeof username !== 'string') problems.push('username must be a string');
  if (typeof password !== 'string') problems.push('password must be a string');
  if (typeof username !== 'string' || typeof password !== 'string') {
    throw new BadRequestException(problems);
  }
  return { username, password };
}
