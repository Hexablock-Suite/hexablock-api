import type { Result } from '../../domain/shared/result.js';
import type { User } from '../../domain/user/user.js';
import type { Username } from '../../domain/user/username.js';

// Port. The store of the User entities. Two users never have usernames
// that differ only in letter case. add() fails with username-taken when
// such a user exists, also after a lookup that missed it.
export interface UserRepository {
  // Finds the user whose username equals the name exactly, letter case included.
  findByUsername(username: Username): Promise<User | null>;
  // Tells if a user has this username when letter case is ignored.
  isUsernameTaken(username: Username): Promise<boolean>;
  add(user: User): Promise<Result<void, 'username-taken'>>;
}

// Injection token for the UserRepository port. It is a plain symbol, as CLOCK is.
export const USER_REPOSITORY = Symbol('UserRepository');
