import { inspect } from 'node:util';
import type { Result } from '../../../src/domain/shared/result.js';
import type { Range } from '../../../src/domain/shared/range.js';
import type { CharacterCount } from '../../../src/domain/user/character-count.js';
import * as passwordModule from '../../../src/domain/user/password.js';
import { PASSWORD_LENGTH, Password } from '../../../src/domain/user/password.js';
import { PasswordAttempt } from '../../../src/domain/user/password-attempt.js';
import { PasswordHash } from '../../../src/domain/user/password-hash.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import * as usernameModule from '../../../src/domain/user/username.js';
import { USERNAME_LENGTH, Username } from '../../../src/domain/user/username.js';
import {
  boundsDeliveredBy,
  deliveredBy,
  keyDeliveredBy,
  RecordingReceiver,
} from '../../support/recording-receiver.js';
import { valueOf } from '../../support/result.js';
import { testUserId } from '../../support/user-ids.js';

// One code point, two UTF-16 units.
const EMOJI = '\u{1F600}';
const ADA_ID = '6f1c1d0e-2b7a-4c55-9a51-0d6c7a1e8f01';

const userId = (value: string): UserId => valueOf(UserId.from(value));
const passwordHash = (value: string): PasswordHash => valueOf(PasswordHash.from(value));

// The numbers of the two CharacterCount bounds that a credential range delivers.
const boundValuesOf = (range: Range<CharacterCount>): number[] =>
  boundsDeliveredBy(range).flatMap(([min, max]) => [...deliveredBy(min), ...deliveredBy(max)]);

// #99: each limit is a Range<CharacterCount>, so no Range<number> stays in the domain.
describe('credential limits', () => {
  it('should_export_username_and_password_ranges_when_domain_sets_the_limits', () => {
    expect(boundValuesOf(USERNAME_LENGTH)).toEqual([3, 32]);
    expect(boundValuesOf(PASSWORD_LENGTH)).toEqual([8, 128]);
  });

  // The OpenAPI pattern of a username moved to the HTTP adapter (#99), so
  // the module exports no string.
  it('should_export_no_primitive_when_the_username_module_lists_its_exports', () => {
    expect(Object.keys(usernameModule).sort()).toEqual(['USERNAME_LENGTH', 'Username']);
  });
});

describe('Username', () => {
  it.each(['ada', 'grace.hopper', 'player_01-x', 'a'.repeat(32)])(
    'should_accept_username_when_it_has_3_to_32_allowed_characters',
    (raw) => {
      const result = Username.create(raw);

      expect(result.ok && deliveredBy(result.value)).toEqual([raw]);
    },
  );

  it.each(['ab', 'a'.repeat(33), 'ada lovelace', 'ada!', ''])(
    'should_reject_username_when_length_or_characters_break_the_rule',
    (raw) => {
      expect(Username.create(raw)).toEqual({ ok: false, error: 'invalid-username' });
    },
  );

  // #73: the key is the name in lower case. Two names with the same key
  // are the same name for uniqueness. The value keeps the typed case.
  it.each(['ada', 'Ada', 'ADA'])(
    'should_give_the_same_key_when_usernames_differ_only_in_letter_case',
    (raw) => {
      const result = Username.create(raw);

      expect(result.ok && [...deliveredBy(result.value), ...keyDeliveredBy(result.value)]).toEqual([
        raw,
        'ada',
      ]);
    },
  );

  // #90: the name and its key leave only through a delivery to a receiver.
  it('should_have_no_public_value_or_key_field_when_both_leave_through_a_delivery', () => {
    const result = Username.create('Ada');
    if (!result.ok) throw new Error(result.error);
    const username = result.value;
    const receiver = new RecordingReceiver<string>();

    // @ts-expect-error -- #90 makes the value private.
    void username.value;
    // @ts-expect-error -- #90 makes the key private.
    void username.key;
    // A delivery returns nothing: the receiver holds the value.
    expect(username.deliverTo(receiver)).toBeUndefined();
    expect(username.deliverKeyTo(receiver)).toBeUndefined();
    expect(receiver.received).toEqual(['Ada', 'ada']);
  });
});

describe('Password', () => {
  it.each(['12345678', 'correct horse battery', 'x'.repeat(128)])(
    'should_accept_password_when_it_has_8_to_128_characters',
    (raw) => {
      const result = Password.create(raw);

      expect(result.ok && deliveredBy(result.value)).toEqual([raw]);
    },
  );

  it.each(['', '1234567', 'x'.repeat(129)])(
    'should_reject_password_when_it_has_fewer_than_8_or_more_than_128_characters',
    (raw) => {
      expect(Password.create(raw)).toEqual({ ok: false, error: 'invalid-password' });
    },
  );

  // The length counts code points, not UTF-16 units (#60).
  it.each([EMOJI.repeat(4), EMOJI.repeat(129)])(
    'should_reject_password_when_it_has_fewer_than_8_or_more_than_128_code_points',
    (raw) => {
      expect(Password.create(raw)).toEqual({ ok: false, error: 'invalid-password' });
    },
  );

  it.each([EMOJI.repeat(8), EMOJI.repeat(128)])(
    'should_accept_password_when_it_has_8_to_128_code_points_in_more_utf16_units',
    (raw) => {
      const result = Password.create(raw);

      expect(result.ok && deliveredBy(result.value)).toEqual([raw]);
    },
  );

  // #90: the text leaves only through a delivery to a receiver.
  it('should_have_no_public_value_field_when_the_password_leaves_through_a_delivery', () => {
    const result = Password.create('correct horse');
    if (!result.ok) throw new Error(result.error);
    const password = result.value;
    const receiver = new RecordingReceiver<string>();

    // @ts-expect-error -- #90 makes the value private.
    void password.value;
    // The delivery returns nothing: the receiver holds the text.
    expect(password.deliverTo(receiver)).toBeUndefined();
    expect(receiver.received).toEqual(['correct horse']);
  });

  it('should_keep_the_length_count_inside_password_when_module_lists_its_exports', () => {
    expect(Object.keys(passwordModule).sort()).toEqual(['PASSWORD_LENGTH', 'Password']);
  });
});

// #98: the text that a player types at sign-in. A wrong password can have
// any length, so the attempt has no length rule and its factory cannot fail.
describe('PasswordAttempt', () => {
  it.each(['', 'short', '1234567', 'correct horse', 'x'.repeat(129), EMOJI.repeat(129)])(
    'should_deliver_the_text_as_typed_when_the_attempt_has_any_length',
    (typed) => {
      const attempt = PasswordAttempt.of(typed);

      expect(attempt).toBeInstanceOf(PasswordAttempt);
      expect(deliveredBy(attempt)).toEqual([typed]);
    },
  );

  // Sign-in asks this before any hash work. A row gives the text and the answer.
  it.each([
    ['x'.repeat(129), true],
    [EMOJI.repeat(129), true],
    ['', false],
    ['1234567', false],
    ['x'.repeat(128), false],
    [EMOJI.repeat(128), false],
  ])(
    'should_tell_that_the_attempt_is_longer_than_any_password_when_it_has_more_than_128_code_points',
    (typed, longer) => {
      expect(PasswordAttempt.of(typed).isLongerThanAnyPassword()).toBe(longer);
    },
  );

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

  // Postgres returns a uuid in lower case, so equals() matches a stored id.
  it('should_store_lower_case_value_when_uuid_has_upper_case_letters', () => {
    const upper = userId(ADA_ID.toUpperCase());

    expect(deliveredBy(upper)).toEqual([ADA_ID]);
    expect(upper.equals(userId(ADA_ID))).toBe(true);
  });

  it('should_be_equal_when_two_user_ids_hold_the_same_value', () => {
    expect(deliveredBy(userId(testUserId(1)))).toEqual([testUserId(1)]);
    expect(userId(testUserId(1)).equals(userId(testUserId(1)))).toBe(true);
    expect(userId(testUserId(1)).equals(userId(testUserId(2)))).toBe(false);
  });

  // A leaderboard lists full ties in one fixed order: the ids in ascending
  // order of their lower case text (decision of #83).
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

  // #90: the id leaves only through a delivery to a receiver.
  it('should_have_no_public_value_field_when_the_user_id_leaves_through_a_delivery', () => {
    const id = userId(ADA_ID);
    const receiver = new RecordingReceiver<string>();

    // @ts-expect-error -- #90 makes the value private.
    void id.value;
    // The delivery returns nothing: the receiver holds the id.
    expect(id.deliverTo(receiver)).toBeUndefined();
    expect(receiver.received).toEqual([ADA_ID]);
  });
});

describe('PasswordHash', () => {
  // One failure mechanism (decision 11): a failed Result with the code of
  // the rule, never an exception.
  it('should_give_the_code_of_the_rule_when_value_is_empty', () => {
    expect(PasswordHash.from('')).toEqual({ ok: false, error: 'invalid-password-hash' });
  });

  it('should_deliver_the_text_to_the_receiver_when_the_factory_took_it', () => {
    expect(deliveredBy(passwordHash('$hash-one'))).toEqual(['$hash-one']);
  });

  // #90: the text leaves only through a delivery to a receiver.
  it('should_have_no_public_value_field_when_the_hash_leaves_through_a_delivery', () => {
    const hash = passwordHash('$hash-one');
    const receiver = new RecordingReceiver<string>();

    // @ts-expect-error -- #90 makes the value private.
    void hash.value;
    // The delivery returns nothing: the receiver holds the text.
    expect(hash.deliverTo(receiver)).toBeUndefined();
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
