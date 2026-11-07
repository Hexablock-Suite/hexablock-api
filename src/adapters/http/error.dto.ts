import { ApiProperty } from '@nestjs/swagger';

// The one body shape of every HTTP error (API-FR-06). HttpErrorFilter
// builds it for every exception. A controller that maps a failed Result
// builds the same shape.
export class ErrorDto {
  @ApiProperty({ example: 404, description: 'The HTTP status code.' })
  readonly statusCode!: number;

  @ApiProperty({ example: 'Not Found', description: 'The standard reason phrase of the status.' })
  readonly error!: string;

  @ApiProperty({
    example: 'Cannot GET /levels/unknown',
    description: 'One sentence that a client can show or log. It never holds the query string.',
  })
  readonly message!: string;

  @ApiProperty({
    type: [String],
    example: ['gameId should not be empty'],
    description:
      'One entry per problem when a request has several. Empty otherwise. No entry holds the query string.',
  })
  readonly details!: string[];

  @ApiProperty({
    example: '/levels/unknown',
    description: 'The request path, without the query string.',
  })
  readonly path!: string;
}
