import { ApiProperty } from '@nestjs/swagger';

// The body of POST /auth/login (API-FR-01). It has no length rules: a
// credential that breaks a rule gets the same 401 as a wrong password.
export class LoginDto {
  @ApiProperty({ example: 'ada' })
  readonly username!: string;

  @ApiProperty({ example: 'correct horse battery' })
  readonly password!: string;
}
