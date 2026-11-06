import type { UserId } from '../../domain/user/user-id.js';

// Port. The source of new user ids. The use cases take randomness only from
// an injected source (rule R-deterministic-core).
export interface UserIdGenerator {
  next(): UserId;
}

// Injection token for the UserIdGenerator port. It is a plain symbol, as CLOCK is.
export const USER_ID_GENERATOR = Symbol('UserIdGenerator');
