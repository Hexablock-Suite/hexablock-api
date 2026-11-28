import { ErrorDto } from './error.dto.js';
import { RETRY_AFTER_HEADER } from './rate-limit.headers.js';

// The message of the 429 answer of a request over the rate limit of
// sign-up and sign-in (API-FR-01, #170). ThrottlerModule writes it, and
// HttpErrorFilter answers it with ErrorDto (API-FR-06).
export const TOO_MANY_REQUESTS_MESSAGE = 'Too many requests. Try again later.';

// The OpenAPI answer of a request over the rate limit. Sign-up and sign-in
// share it, so the sentence has one home.
export const TOO_MANY_REQUESTS = {
  type: ErrorDto,
  description:
    'This client sent more requests to this route in one minute than the rate limit allows (AUTH_RATE_LIMIT, 10 by default). The use case does not run. The Retry-After header gives the seconds to wait.',
  headers: RETRY_AFTER_HEADER,
};
