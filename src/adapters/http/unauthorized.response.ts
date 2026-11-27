import { ErrorDto } from './error.dto.js';

// The OpenAPI answer of a route behind JwtAuthGuard when the guard rejects
// the token (API-FR-01, API-FR-06). The four controllers share it, so the
// sentence has one home (#215). The 401 of a wrong sign-in is another
// answer, and AuthController writes it.
export const UNAUTHORIZED = {
  type: ErrorDto,
  description:
    'The bearer token is missing, malformed, expired, signed with another key or names a user that is not stored.',
};
