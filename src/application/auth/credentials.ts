import type { Password } from '../../domain/user/password.js';
import type { PasswordAttempt } from '../../domain/user/password-attempt.js';
import type { Username } from '../../domain/user/username.js';

// The inputs of the RegisterUser and Login input ports. They carry domain
// values, not strings. AuthDtoMapper of the HTTP adapter builds them from
// the body, so a use case never builds a domain value from a request field
// (decision 12 of docs/architecture/classes.md, #105).

// The credentials of a new account. Each value follows its rule.
export interface RegisterUserRequest {
  readonly username: Username;
  readonly password: Password;
}

// The credentials of a sign-in. The username follows its rule. The attempt
// is the text as the player typed it: it has no length rule (#98).
export interface LoginRequest {
  readonly username: Username;
  readonly attempt: PasswordAttempt;
}
