import { err, ok, type Result } from '../../domain/shared/result.js';
import { Password } from '../../domain/user/password.js';
import { PasswordHash } from '../../domain/user/password-hash.js';
import { User } from '../../domain/user/user.js';
import type { UserId } from '../../domain/user/user-id.js';
import { Username } from '../../domain/user/username.js';
import type { PasswordHasher } from '../ports/password-hasher.js';
import type { UserIdGenerator } from '../ports/user-id-generator.js';
import type { UserRepository } from '../ports/user-repository.js';
import type { CredentialField, Credentials } from './credentials.js';

export type RegisterProblem =
  | { readonly kind: 'invalid-credentials'; readonly fields: CredentialField[] }
  | { readonly kind: 'username-taken' };

// Input port of sign-up (API-FR-01).
export interface RegisterUser {
  execute(request: Credentials): Promise<Result<UserId, RegisterProblem>>;
}

export const REGISTER_USER = Symbol('RegisterUser');

// Adds a user with the hash of the password, never the plain password.
export class RegisterUseCase implements RegisterUser {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly ids: UserIdGenerator,
  ) {}

  async execute(request: Credentials): Promise<Result<UserId, RegisterProblem>> {
    const username = Username.create(request.username);
    const password = Password.create(request.password);
    if (!username.ok || !password.ok) {
      const fields: CredentialField[] = [];
      if (!username.ok) fields.push('username');
      if (!password.ok) fields.push('password');
      return err({ kind: 'invalid-credentials', fields });
    }
    // A name that differs from a stored one only in letter case is taken.
    if (await this.users.isUsernameTaken(username.value)) {
      return err({ kind: 'username-taken' });
    }
    const hash = PasswordHash.from(await this.hasher.hash(password.value.value));
    const user = new User(this.ids.next(), username.value, hash);
    const added = await this.users.add(user);
    return added.ok ? ok(user.id) : err({ kind: 'username-taken' });
  }
}
