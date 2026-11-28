// The OpenAPI headers of the rate limit of sign-up and sign-in (API-FR-01,
// #170). ThrottlerGuard writes them. Each header has one definition, which
// buildOpenApiDocument() puts in components.headers. The answers of the two
// routes name a definition with a $ref, so no answer copies it.
const INTEGER = { type: 'integer' };

export const RATE_LIMIT_HEADER_DEFINITIONS = {
  'X-RateLimit-Limit': {
    description: 'The requests that this client may send to this route in one minute.',
    schema: INTEGER,
  },
  'X-RateLimit-Remaining': {
    description:
      'The requests that this client may still send to this route in the current minute.',
    schema: INTEGER,
  },
  'X-RateLimit-Reset': {
    description: 'The seconds until the current minute of the rate limit ends.',
    schema: INTEGER,
  },
  'Retry-After': {
    description: 'The seconds until this client may send a request to this route again.',
    schema: INTEGER,
  },
};

type RateLimitHeader = keyof typeof RATE_LIMIT_HEADER_DEFINITIONS;

const refOf = (name: RateLimitHeader) => ({ $ref: `#/components/headers/${name}` });

// The three counters of every answer of sign-up and sign-in under the
// limit. A 429 answer has only Retry-After.
export const RATE_LIMIT_HEADERS = {
  'X-RateLimit-Limit': refOf('X-RateLimit-Limit'),
  'X-RateLimit-Remaining': refOf('X-RateLimit-Remaining'),
  'X-RateLimit-Reset': refOf('X-RateLimit-Reset'),
};

export const RETRY_AFTER_HEADER = { 'Retry-After': refOf('Retry-After') };
