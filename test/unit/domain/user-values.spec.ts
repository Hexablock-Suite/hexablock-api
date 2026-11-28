import { inspect } from 'node:util';
import type { Result } from '../../../src/domain/shared/result.js';
import { Password } from '../../../src/domain/user/password.js';
import { PasswordAttempt } from '../../../src/domain/user/password-attempt.js';
import { PasswordHash } from '../../../src/domain/user/password-hash.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import { USERNAME_CHARACTERS, Username } from '../../../src/domain/user/username.js';
import { deliveredBy } from '../../support/recording-receiver.js';
import { valueOf } from '../../support/result.js';
import { testUserId } from '../../support/user-ids.js';

const ADA_ID = '6f1c1d0e-2b7a-4c55-9a51-0d6c7a1e8f01';

const userId = (value: string): UserId => valueOf(UserId.from(value));
const passwordHash = (value: string): PasswordHash => valueOf(PasswordHash.from(value));

// #255: the credential rules are tested through the use cases and the root.
// RegisterUseCase holds the length and the characters of a username, the
// length of a password in code points and the collision of two names that
// differ only in letter case. LoginUseCase holds the key of a name at
// sign-in and the length of a typed password. User holds the lower case id
// and the hash that JSON does not show. The cases below stay, because no
// root and no use case reaches their rule. Each group says why.

// #149: the allowed characters of a username have one home, in the domain.
// RegisterUseCase holds the check of the characters, but no root delivers
// them: only the OpenAPI pattern of the border receives them.
describe('credential limits', () => {
  it('should_deliver_the_allowed_characters_once_when_a_border_asks_for_them', () => {
    expect(deliveredBy(USERNAME_CHARACTERS)).toEqual(['[A-Za-z0-9._-]']);
  });
});

// The root and the use cases take a built UserId. Only the border builds one
// from a text: a row, the subject of a token or the list of level editors.
describe('UserId', () => {
  // One failure mechanism (decision 11): a failed Result with the code of
  // the rule, never an exception. #39 rejected blank ids, and a caller
  // outside TypeScript can pass no string.
  it.each(['', '   ', undefined])(
    'should_give_the_code_of_the_rule_when_value_is_empty_blank_or_not_a_string',
    (value) => {
      expect(UserId.from(value as unknown as string)).toEqual({
        ok: false,
        error: 'invalid-user-id',
      });
    },
  );

  // users.id and progress.user_id are uuid columns (#64).
  it.each([
    'not-a-uuid',
    'user-1',
    `{${ADA_ID}}`,
    ADA_ID.replace('-', ''),
    `${ADA_ID}0`,
    ` ${ADA_ID}`,
    `${ADA_ID}\n`,
    ADA_ID.replace('6', 'g'),
  ])('should_give_the_code_of_the_rule_when_value_is_not_a_uuid', (value) => {
    expect(UserId.from(value)).toEqual({ ok: false, error: 'invalid-user-id' });
  });

  // RFC 9562 defines the nil UUID, and a uuid column stores it.
  it('should_accept_user_id_when_value_is_the_nil_uuid', () => {
    const nil = '00000000-0000-0000-0000-000000000000';

    expect(deliveredBy(userId(nil))).toEqual([nil]);
  });

  // A leaderboard lists full ties in one fixed order: the ids in ascending
  // order of their lower case text (decision of #83). Only the leaderboard
  // files of test/domain/progress reach this order. The use case tests of
  // the leaderboards do not, so the case stays until they do (#255).
  it('should_come_before_another_id_when_its_lower_case_value_sorts_first', () => {
    const first = userId(testUserId(1));
    const second = userId(testUserId(2));
    // The raw text «F…» sorts before «a…», but the lower case text «f…» sorts after it.
    const upperF = userId('F0000000-0000-4000-8000-000000000000');
    const lowerA = userId('a0000000-0000-4000-8000-000000000000');

    expect(first.comesBefore(second)).toBe(true);
    expect(second.comesBefore(first)).toBe(false);
    expect(first.comesBefore(userId(testUserId(1)))).toBe(false);
    expect(lowerA.comesBefore(upperF)).toBe(true);
    expect(upperF.comesBefore(lowerA)).toBe(false);
  });
});

// The root and the use cases take a built PasswordHash. Only the border
// builds one from a text: a row or the hasher adapter.
describe('PasswordHash', () => {
  // One failure mechanism (decision 11): a failed Result with the code of
  // the rule, never an exception.
  it('should_give_the_code_of_the_rule_when_value_is_empty', () => {
    expect(PasswordHash.from('')).toEqual({ ok: false, error: 'invalid-password-hash' });
  });
});

// No root holds a Password or a PasswordAttempt: a use case passes each one
// to the PasswordHasher port only, and LoggingAspect writes no request. So
// only these cases show that a logger sees no typed text.
describe('Password', () => {
  // #138: a logger or an error body writes an object with JSON.stringify().
  // The text is an ECMAScript private field, so JSON shows no text.
  it('should_show_no_typed_text_when_json_receives_the_password', () => {
    const password = valueOf(Password.create('correct horse battery'));

    expect(JSON.stringify(password)).not.toContain('correct horse battery');
    expect(JSON.stringify({ password })).not.toContain('correct horse battery');
    expect(deliveredBy(password)).toEqual(['correct horse battery']);
  });
});

describe('PasswordAttempt', () => {
  // A logger writes an object with util.inspect() or JSON.stringify(). Neither
  // one sees the text, and the text leaves only through a delivery.
  it('should_show_no_typed_text_when_a_logger_or_json_receives_the_attempt', () => {
    const attempt = PasswordAttempt.of('correct horse');
    // A logger can get any value, so the test passes the attempt as unknown.
    const logged: unknown = attempt;

    expect(JSON.stringify(attempt)).toBe('{}');
    expect(JSON.stringify({ attempt })).toBe('{"attempt":{}}');
    expect(inspect(attempt, { showHidden: true, depth: null })).not.toContain('correct horse');
    expect(String(logged)).toBe('[object Object]');
    expect(Object.getOwnPropertyNames(attempt)).toEqual([]);
    expect(deliveredBy(attempt)).toEqual(['correct horse']);
  });
});

// No code of src/ calls these equals(): two users collide by the key of
// their names, and sign-in checks a password through the PasswordHasher port.
describe('credential values equals', () => {
  function created<T>(result: Result<T, string>): T {
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }

  it('should_be_equal_when_two_usernames_have_the_same_letters_and_case', () => {
    const name = created(Username.create('Ada'));
    const twin = created(Username.create('Ada'));

    expect(twin).not.toBe(name);
    expect(name.equals(twin)).toBe(true);
    expect(twin.equals(name)).toBe(true);
  });

  it.each(['ada', 'Grace'])(
    'should_not_be_equal_when_two_usernames_differ_in_letters_or_case',
    (raw) => {
      const name = created(Username.create('Ada'));
      const different = created(Username.create(raw));

      expect(name.equals(different)).toBe(false);
      expect(different.equals(name)).toBe(false);
    },
  );

  it('should_be_equal_when_two_passwords_hold_the_same_text', () => {
    const password = created(Password.create('correct-horse'));
    const twin = created(Password.create('correct-horse'));
    const other = created(Password.create('correct-horses'));

    expect(twin).not.toBe(password);
    expect(password.equals(twin)).toBe(true);
    expect(twin.equals(password)).toBe(true);
    expect(password.equals(other)).toBe(false);
    expect(other.equals(password)).toBe(false);
  });

  it('should_be_equal_when_two_password_hashes_hold_the_same_text', () => {
    const hash = passwordHash('$hash-one');
    const twin = passwordHash('$hash-one');
    const other = passwordHash('$hash-two');

    expect(twin).not.toBe(hash);
    expect(hash.equals(twin)).toBe(true);
    expect(twin.equals(hash)).toBe(true);
    expect(hash.equals(other)).toBe(false);
    expect(other.equals(hash)).toBe(false);
  });
});
