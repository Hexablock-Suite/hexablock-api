import type { LoginRequest, RegisterUserRequest } from '../../application/auth/credentials.js';
import type { LoginProblem } from '../../application/auth/login.use-case.js';
import type { SessionToken } from '../../application/auth/session-token.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import { Password, PASSWORD_LENGTH, type PasswordProblem } from '../../domain/user/password.js';
import { PasswordAttempt } from '../../domain/user/password-attempt.js';
import type { UserId } from '../../domain/shared/user-id.js';
import { USERNAME_LENGTH, Username, type UsernameProblem } from '../../domain/shared/username.js';
import { receiveBoundValuesOf, receiveValueOf } from '../received.js';
import type { CurrentUserDto } from './current-user.dto.js';
import type { TokenDto } from './token.dto.js';

// The messages name the limits that the domain ranges deliver.
const USERNAME_BOUNDS = receiveBoundValuesOf(USERNAME_LENGTH);
const PASSWORD_BOUNDS = receiveBoundValuesOf(PASSWORD_LENGTH);

// The text of each credential rule. The factory gives the code of the
// broken rule, and the border writes the text (decision 11). Each 400 body
// of sign-up keeps these texts word for word.
const RULES: Record<UsernameProblem | PasswordProblem, string> = {
  'invalid-username': `username must have ${USERNAME_BOUNDS.min} to ${USERNAME_BOUNDS.max} characters: letters, digits, dots, hyphens or underscores`,
  'invalid-password': `password must have ${PASSWORD_BOUNDS.min} to ${PASSWORD_BOUNDS.max} characters`,
};

// The two fields of a sign-up or a sign-in body, after the shape check.
interface TypedCredentials {
  readonly username: string;
  readonly password: string;
}

// Why a sign-in body gives no LoginRequest. A body of the wrong shape gets
// a 400 with its problems. A username that breaks its rule gets the problem
// of a wrong password: no stored user has such a name.
export type SignInProblem =
  | { readonly kind: 'invalid-body'; readonly problems: string[] }
  | LoginProblem;

// Translates between the auth DTOs and the account use cases (decision 12).
// AuthController holds no translation code: no shape check and no rule
// message. The mapper builds the domain values of each request, so a use
// case gets them built.
export const AuthDtoMapper = {
  // The mapper builds both values before it answers. So a 400 names each
  // broken rule, username first.
  toRegisterRequest(body: unknown): Result<RegisterUserRequest, string[]> {
    const credentials = credentialsFrom(body);
    if (!credentials.ok) {
      return credentials;
    }
    const username = Username.create(credentials.value.username);
    const password = Password.create(credentials.value.password);
    if (!username.ok || !password.ok) {
      const problems: string[] = [];
      if (!username.ok) problems.push(RULES[username.error]);
      if (!password.ok) problems.push(RULES[password.error]);
      return err(problems);
    }
    return ok({ username: username.value, password: password.value });
  },

  // A PasswordAttempt has no length rule, so the mapper builds it from any
  // text. LoginUseCase asks isLongerThanAnyPassword() before any hash work.
  // A username that breaks its rule stops here and costs no hash work. No
  // stored user has such a name, so the answer time tells nothing about
  // the stored names (#105).
  toLoginRequest(body: unknown): Result<LoginRequest, SignInProblem> {
    const credentials = credentialsFrom(body);
    if (!credentials.ok) {
      return err({ kind: 'invalid-body', problems: credentials.error });
    }
    const username = Username.create(credentials.value.username);
    if (!username.ok) {
      return err({ kind: 'invalid-credentials' });
    }
    return ok({
      username: username.value,
      attempt: PasswordAttempt.of(credentials.value.password),
    });
  },

  toTokenDto(token: SessionToken): TokenDto {
    return { accessToken: token };
  },

  // The UserId delivers its lower case form.
  toCurrentUserDto(userId: UserId): CurrentUserDto {
    return { userId: receiveValueOf(userId) };
  },
};

// The app has no validation pipe, so the mapper checks the body shape. Each
// field that is not a string gives one problem, username first.
function credentialsFrom(body: unknown): Result<TypedCredentials, string[]> {
  const fields = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const { username, password } = fields;
  const problems: string[] = [];
  if (typeof username !== 'string') problems.push('username must be a string');
  if (typeof password !== 'string') problems.push('password must be a string');
  if (typeof username !== 'string' || typeof password !== 'string') {
    return err(problems);
  }
  return ok({ username, password });
}
