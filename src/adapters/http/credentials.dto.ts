import { ApiProperty } from '@nestjs/swagger';
import { PASSWORD_LENGTH } from '../../domain/user/password.js';
import { USERNAME_LENGTH } from '../../domain/user/username.js';
import { receiveBoundValuesOf } from '../received.js';

// The decorators need the limits when the class is defined, so the module
// receives them once from the domain ranges.
const USERNAME_BOUNDS = receiveBoundValuesOf(USERNAME_LENGTH);
const PASSWORD_BOUNDS = receiveBoundValuesOf(PASSWORD_LENGTH);

// The username rule as one pattern, for the OpenAPI schema of the request
// body. Username.create() checks the same rule in the domain: these
// characters and the limits of USERNAME_LENGTH. The domain exports no
// string, so the pattern lives at the border (#99).
// test/unit/adapters/credentials-dto.spec.ts checks that both accept the same names.
export const USERNAME_PATTERN = `^[A-Za-z0-9._-]{${USERNAME_BOUNDS.min},${USERNAME_BOUNDS.max}}$`;

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
