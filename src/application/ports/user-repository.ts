import type { Result } from '../../domain/shared/result.js';
import type { User } from '../../domain/user/user.js';
import type { Username } from '../../domain/user/username.js';

// Port. The store of the User entities. add() fails with username-taken
// when another user with the same username exists, also after a lookup
// that missed it.
export interface UserRepository {
  findByUsername(username: Username): Promise<User | null>;
  add(user: User): Promise<Result<void, 'username-taken'>>;
}

// Injection token for the UserRepository port. It is a plain symbol, as CLOCK is.
export const USER_REPOSITORY = Symbol('UserRepository');
