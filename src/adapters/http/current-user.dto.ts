import { ApiProperty } from '@nestjs/swagger';

// The answer of GET /auth/me: the user that the bearer token names.
export class CurrentUserDto {
  @ApiProperty({ example: '0b6f6a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b', description: 'The user id.' })
  readonly userId!: string;
}
