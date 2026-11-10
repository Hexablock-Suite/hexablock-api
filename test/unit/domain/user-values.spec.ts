import type { Result } from '../../../src/domain/shared/result.js';
import * as passwordModule from '../../../src/domain/user/password.js';
import { PASSWORD_LENGTH, Password } from '../../../src/domain/user/password.js';
import { PasswordHash } from '../../../src/domain/user/password-hash.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import { USERNAME_LENGTH, Username } from '../../../src/domain/user/username.js';
import { testUserId } from '../../support/user-ids.js';

// One code point, two UTF-16 units.
const EMOJI = '\u{1F600}';
const ADA_ID = '6f1c1d0e-2b7a-4c55-9a51-0d6c7a1e8f01';

describe('credential limits', () => {
  it('should_export_username_and_password_ranges_when_domain_sets_the_limits', () => {
    expect([USERNAME_LENGTH.min, USERNAME_LENGTH.max]).toEqual([3, 32]);
    expect([PASSWORD_LENGTH.min, PASSWORD_LENGTH.max]).toEqual([8, 128]);
  });
});

describe('Username', () => {
  it('should_accept_username_when_it_has_3_to_32_allowed_characters', () => {
    for (const raw of ['ada', 'grace.hopper', 'player_01-x', 'a'.repeat(32)]) {
      const result = Username.create(raw);

      expect(result.ok && result.value.value).toBe(raw);
    }
  });

  it('should_reject_username_when_length_or_characters_break_the_rule', () => {
    for (const raw of ['ab', 'a'.repeat(33), 'ada lovelace', 'ada!', '']) {
      expect(Username.create(raw)).toEqual({ ok: false, error: 'invalid-username' });
    }
  });

  // #73: the key is the name in lower case. Two names with the same key
  // are the same name for uniqueness. The value keeps the typed case.
  it('should_give_the_same_key_when_usernames_differ_only_in_letter_case', () => {
    for (const raw of ['ada', 'Ada', 'ADA']) {
      const result = Username.create(raw);

      expect(result.ok && [result.value.value, result.value.key]).toEqual([raw, 'ada']);
    }
  });
});

describe('Password', () => {
  it('should_accept_password_when_it_has_8_to_128_characters', () => {
    for (const raw of ['12345678', 'correct horse battery', 'x'.repeat(128)]) {
      const result = Password.create(raw);

      expect(result.ok && result.value.value).toBe(raw);
    }
  });

  it('should_reject_password_when_it_has_fewer_than_8_or_more_than_128_characters', () => {
    for (const raw of ['', '1234567', 'x'.repeat(129)]) {
      expect(Password.create(raw)).toEqual({ ok: false, error: 'invalid-password' });
    }
  });

  // The length counts code points, not UTF-16 units (#60).
  it('should_reject_password_when_it_has_fewer_than_8_or_more_than_128_code_points', () => {
    for (const raw of [EMOJI.repeat(4), EMOJI.repeat(129)]) {
      expect(Password.create(raw)).toEqual({ ok: false, error: 'invalid-password' });
    }
  });

  it('should_accept_password_when_it_has_8_to_128_code_points_in_more_utf16_units', () => {
    for (const raw of [EMOJI.repeat(8), EMOJI.repeat(128)]) {
      const result = Password.create(raw);

      expect(result.ok && result.value.value).toBe(raw);
    }
  });

  // Sign-in checks a text that is not a Password yet, so the operation takes the raw text.
  it('should_tell_that_text_is_too_long_when_it_has_more_than_128_code_points', () => {
    for (const raw of ['x'.repeat(129), EMOJI.repeat(129)]) {
      expect(Password.isTooLong(raw)).toBe(true);
    }
    for (const raw of ['', '1234567', 'x'.repeat(128), EMOJI.repeat(128)]) {
      expect(Password.isTooLong(raw)).toBe(false);
    }
  });

  it('should_keep_the_length_count_inside_password_when_module_lists_its_exports', () => {
    expect(Object.keys(passwordModule).sort()).toEqual(['PASSWORD_LENGTH', 'Password']);
  });
});

describe('UserId', () => {
  it('should_reject_user_id_when_value_is_empty', () => {
    expect(() => UserId.from('')).toThrow('A UserId needs a value.');
  });

  // #39 rejected blank ids. A caller outside TypeScript can pass no string.
  it('should_reject_user_id_when_value_is_blank_or_not_a_string', () => {
    expect(() => UserId.from('   ')).toThrow('A UserId needs a value.');
    expect(() => UserId.from(undefined as unknown as string)).toThrow('A UserId needs a value.');
  });

  // users.id and progress.user_id are uuid columns (#64).
  it('should_reject_user_id_when_value_is_not_a_uuid', () => {
    const invalid = [
      'not-a-uuid',
      'user-1',
      `{${ADA_ID}}`,
      ADA_ID.replace('-', ''),
      `${ADA_ID}0`,
      ` ${ADA_ID}`,
      `${ADA_ID}\n`,
      ADA_ID.replace('6', 'g'),
    ];

    for (const value of invalid) {
      expect(() => UserId.from(value)).toThrow('A UserId must be a UUID.');
    }
  });

  // RFC 9562 defines the nil UUID, and a uuid column stores it.
  it('should_accept_user_id_when_value_is_the_nil_uuid', () => {
    const nil = '00000000-0000-0000-0000-000000000000';

    expect(UserId.from(nil).value).toBe(nil);
  });

  // Postgres returns a uuid in lower case, so equals() matches a stored id.
  it('should_store_lower_case_value_when_uuid_has_upper_case_letters', () => {
    const upper = UserId.from(ADA_ID.toUpperCase());

    expect(upper.value).toBe(ADA_ID);
    expect(upper.equals(UserId.from(ADA_ID))).toBe(true);
  });

  it('should_be_equal_when_two_user_ids_hold_the_same_value', () => {
    expect(UserId.from(testUserId(1)).value).toBe(testUserId(1));
    expect(UserId.from(testUserId(1)).equals(UserId.from(testUserId(1)))).toBe(true);
    expect(UserId.from(testUserId(1)).equals(UserId.from(testUserId(2)))).toBe(false);
  });
});

describe('PasswordHash', () => {
  it('should_reject_password_hash_when_value_is_empty', () => {
    expect(() => PasswordHash.from('')).toThrow('A PasswordHash needs a value.');
  });
});

describe('credential values equals', () => {
  function created<T>(result: Result<T, string>): T {
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }

  it('should_be_equal_when_two_usernames_have_the_same_letters_and_case', () => {
    const name = created(Username.create('Ada'));
    const twin = created(Username.create('Ada'));
    const lowerCase = created(Username.create('ada'));
    const other = created(Username.create('Grace'));

    expect(twin).not.toBe(name);
    expect(name.equals(twin)).toBe(true);
    expect(twin.equals(name)).toBe(true);
    for (const different of [lowerCase, other]) {
      expect(name.equals(different)).toBe(false);
      expect(different.equals(name)).toBe(false);
    }
  });

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
    const hash = PasswordHash.from('$hash-one');
    const twin = PasswordHash.from('$hash-one');
    const other = PasswordHash.from('$hash-two');

    expect(twin).not.toBe(hash);
    expect(hash.equals(twin)).toBe(true);
    expect(twin.equals(hash)).toBe(true);
    expect(hash.equals(other)).toBe(false);
    expect(other.equals(hash)).toBe(false);
  });
});
