import { ApiProperty } from '@nestjs/swagger';
import { PASSWORD_LENGTH } from '../../domain/user/password.js';
import { USERNAME_LENGTH, USERNAME_PATTERN } from '../../domain/user/username.js';
import { receiveBoundsOf } from '../received.js';

// The decorators need the limits when the class is defined, so the module
// receives them once from the domain ranges.
const USERNAME_BOUNDS = receiveBoundsOf(USERNAME_LENGTH);
const PASSWORD_BOUNDS = receiveBoundsOf(PASSWORD_LENGTH);

// The body of POST /auth/register (API-FR-01). The limits come from the
// domain, so OpenAPI publishes the rules that Username and Password check.
export class CredentialsDto {
  @ApiProperty({
    example: 'ada',
    minLength: USERNAME_BOUNDS.min,
    maxLength: USERNAME_BOUNDS.max,
    pattern: USERNAME_PATTERN,
    description: 'Letters, digits, dots, hyphens or underscores.',
  })
  readonly username!: string;

  @ApiProperty({
    example: 'correct horse battery',
    minLength: PASSWORD_BOUNDS.min,
    maxLength: PASSWORD_BOUNDS.max,
  })
  readonly password!: string;
}
