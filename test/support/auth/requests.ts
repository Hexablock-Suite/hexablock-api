import type {
  LoginRequest,
  RegisterUserRequest,
} from '../../../src/application/auth/credentials.js';
import { err, ok, type Result } from '../../../src/domain/shared/result.js';
import { Password, type PasswordProblem } from '../../../src/domain/user/password.js';
import { PasswordAttempt } from '../../../src/domain/user/password-attempt.js';
import { Username, type UsernameProblem } from '../../../src/domain/shared/username.js';
import { valueOf } from '../result.js';

// Builds the request of an account port from plain values, as AuthDtoMapper
// does at the border. A use case test passes these domain values, so no use
// case builds one from a loose primitive (decision 12).

// The code of the first credential that breaks its rule.
export type CredentialProblem = UsernameProblem | PasswordProblem;

// The request of a sign-up, or the code of the broken rule. It checks the
// username first, as AuthDtoMapper does.
export function registerRequestOf(
  username: string,
  password: string,
): Result<RegisterUserRequest, CredentialProblem> {
  const name = Username.create(username);
  if (!name.ok) {
    return err(name.error);
  }
  const secret = Password.create(password);
  if (!secret.ok) {
    return err(secret.error);
  }
  return ok({ username: name.value, password: secret.value });
}

// The request of a sign-up whose values follow their rules. A broken rule
// throws, so the test that expects a request fails with the problem.
export function registerRequest(username: string, password: string): RegisterUserRequest {
  return valueOf(registerRequestOf(username, password));
}

export function loginRequest(username: string, typed: string): LoginRequest {
  return { username: valueOf(Username.create(username)), attempt: PasswordAttempt.of(typed) };
}
