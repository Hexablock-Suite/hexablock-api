import { err, ok, type Result } from '../shared/result.js';

// 3 to 32 letters, digits, dots, hyphens or underscores. A proposal for
// team review: API-FR-01 sets no rule.
const USERNAME_RULE = /^[A-Za-z0-9._-]{3,32}$/;

export type UsernameProblem = 'invalid-username';

// The name a player signs in with. It is unique among users.
export class Username {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<Username, UsernameProblem> {
    return USERNAME_RULE.test(raw) ? ok(new Username(raw)) : err('invalid-username');
  }
}
