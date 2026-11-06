import { ApiProperty } from '@nestjs/swagger';

// The body of POST /auth/register and POST /auth/login (API-FR-01).
export class CredentialsDto {
  @ApiProperty({
    example: 'ada',
    minLength: 3,
    maxLength: 32,
    pattern: '^[A-Za-z0-9._-]{3,32}$',
    description: 'Letters, digits, dots, hyphens or underscores.',
  })
  readonly username!: string;

  @ApiProperty({ example: 'correct horse battery', minLength: 8, maxLength: 128 })
  readonly password!: string;
}
