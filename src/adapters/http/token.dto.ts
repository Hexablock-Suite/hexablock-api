import { ApiProperty } from '@nestjs/swagger';

// The answer of POST /v1/auth/login. The client sends the token as
// `Authorization: Bearer <accessToken>`.
export class TokenDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', description: 'A signed JWT.' })
  readonly accessToken!: string;
}
