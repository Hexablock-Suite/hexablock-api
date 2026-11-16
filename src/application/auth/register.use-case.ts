import { err, ok, type Result } from '../../domain/shared/result.js';
import { User } from '../../domain/user/user.js';
import type { UserId } from '../../domain/user/user-id.js';
import type { PasswordHasher } from '../ports/password-hasher.js';
import type { UserIdGenerator } from '../ports/user-id-generator.js';
import type { UserRepository } from '../ports/user-repository.js';
import type { UseCase } from '../use-case.js';
import type { RegisterUserRequest } from './credentials.js';

// The request carries a Username and a Password that follow their rules, so
// the one expected failure is a taken name.
export type RegisterProblem = { readonly kind: 'username-taken' };

// Input port of sign-up (API-FR-01). It binds UseCase, so one aspect can
// wrap it (decision 7).
export type RegisterUser = UseCase<RegisterUserRequest, Result<UserId, RegisterProblem>>;

export const REGISTER_USER = Symbol('RegisterUser');

// Adds a user with the hash of the password, never the plain password. It
// receives the Username and the Password built, and builds no domain value.
export class RegisterUseCase implements RegisterUser {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly ids: UserIdGenerator,
  ) {}

  async execute(request: RegisterUserRequest): Promise<Result<UserId, RegisterProblem>> {
    const { username, password } = request;
    // A name that differs from a stored one only in letter case is taken.
    if (await this.users.isUsernameTaken(username)) {
      return err({ kind: 'username-taken' });
    }
    const hash = await this.hasher.hash(password);
    // The use case keeps the id that it made, so it reads no field of the user.
    const id = this.ids.next();
    const added = await this.users.add(User.register(id, username, hash));
    return added.ok ? ok(id) : err({ kind: 'username-taken' });
  }
}
