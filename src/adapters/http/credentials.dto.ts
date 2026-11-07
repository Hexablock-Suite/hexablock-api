import { ApiProperty } from '@nestjs/swagger';
import { PASSWORD_LENGTH } from '../../domain/user/password.js';
import { USERNAME_LENGTH, USERNAME_PATTERN } from '../../domain/user/username.js';

// The body of POST /auth/register (API-FR-01). The limits come from the
// domain, so OpenAPI publishes the rules that Username and Password check.
export class CredentialsDto {
  @ApiProperty({
    example: 'ada',
    minLength: USERNAME_LENGTH.min,
    maxLength: USERNAME_LENGTH.max,
    pattern: USERNAME_PATTERN,
    description: 'Letters, digits, dots, hyphens or underscores.',
  })
  readonly username!: string;

  @ApiProperty({
    example: 'correct horse battery',
    minLength: PASSWORD_LENGTH.min,
    maxLength: PASSWORD_LENGTH.max,
  })
  readonly password!: string;
}
