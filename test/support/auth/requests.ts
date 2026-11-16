import type {
  LoginRequest,
  RegisterUserRequest,
} from '../../../src/application/auth/credentials.js';
import { Password } from '../../../src/domain/user/password.js';
import { PasswordAttempt } from '../../../src/domain/user/password-attempt.js';
import { Username } from '../../../src/domain/user/username.js';
import { valueOf } from '../result.js';

// Builds the request of an account port from plain values, as AuthDtoMapper
// does at the border. A use case test passes these domain values, so no use
// case builds one from a loose primitive (decision 12).

export function registerRequest(username: string, password: string): RegisterUserRequest {
  return {
    username: valueOf(Username.create(username)),
    password: valueOf(Password.create(password)),
  };
}

export function loginRequest(username: string, typed: string): LoginRequest {
  return { username: valueOf(Username.create(username)), attempt: PasswordAttempt.of(typed) };
}
