import { err, ok, type Result } from '../shared/result.js';

// The upper limit keeps the hash work of one request bounded. Both limits
// are a proposal for team review: API-FR-01 sets no rule.
const MIN_LENGTH = 8;
const MAX_LENGTH = 128;

export type PasswordProblem = 'invalid-password';

// A plain password that a new user chooses. Only the hash is stored.
export class Password {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<Password, PasswordProblem> {
    return raw.length >= MIN_LENGTH && raw.length <= MAX_LENGTH
      ? ok(new Password(raw))
      : err('invalid-password');
  }
}
