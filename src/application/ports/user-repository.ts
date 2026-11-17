import type { Result } from '../../domain/shared/result.js';
import type { User } from '../../domain/user/user.js';
import type { Username } from '../../domain/user/username.js';

// Port. The store of the User entities. No two users have names that
// collide (Username.collidesWith(), #100), so their names never differ only
// in letter case. add() fails with username-taken when such a user exists,
// also after a lookup that missed it. test/support/user-repository.contract.ts
// holds the cases that every adapter passes.
export interface UserRepository {
  // Finds the user whose username collides with the name: the same lower-case
  // key that sign-up compares (#144). The user keeps the stored letter case.
  findByUsername(username: Username): Promise<User | null>;
  // Tells if a user has a username that collides with the name.
  isUsernameTaken(username: Username): Promise<boolean>;
  add(user: User): Promise<Result<void, 'username-taken'>>;
}

// Injection token for the UserRepository port. It is a plain symbol, as CLOCK is.
export const USER_REPOSITORY = Symbol('UserRepository');
