import type { User } from '../../domain/user/user.js';
import type { UserId } from '../../domain/user/user-id.js';

// The opaque token that a signed-in client sends with each guarded request.
export type SessionToken = string;

// Port. It issues a SessionToken for a user and reads the id of the user
// back from a token. issue() takes the User, so the use case reads no field
// of it: the adapter reads the id from the snapshot. verify() returns null
// for a token that is not valid (decision 14).
export interface TokenIssuer {
  issue(user: User): SessionToken;
  verify(token: SessionToken): UserId | null;
}

// Injection token for the TokenIssuer port. It is a plain symbol, as CLOCK is.
export const TOKEN_ISSUER = Symbol('TokenIssuer');
