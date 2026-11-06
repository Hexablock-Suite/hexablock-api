import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { CredentialField, Credentials } from '../../application/auth/credentials.js';
import { LOGIN, type Login } from '../../application/auth/login.use-case.js';
import { REGISTER_USER, type RegisterUser } from '../../application/auth/register.use-case.js';
import { CredentialsDto } from './credentials.dto.js';
import { ErrorDto } from './error.dto.js';
import { TokenDto } from './token.dto.js';

const RULES: Record<CredentialField, string> = {
  username: 'username must have 3 to 32 characters: letters, digits, dots, hyphens or underscores',
  password: 'password must have 8 to 128 characters',
};

// Sign-up and sign-in (API-FR-01). No route here has a token guard, because
// the player has no token yet. A failed Result becomes an HttpException, and
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
  @ApiConflictResponse({ type: ErrorDto, description: 'Another user has this username.' })
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
  async signIn(@Body() body: CredentialsDto): Promise<TokenDto> {
    const result = await this.login.execute(credentialsFrom(body));
    if (!result.ok) {
      throw new UnauthorizedException('Invalid username or password');
    }
    return { accessToken: result.value };
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
