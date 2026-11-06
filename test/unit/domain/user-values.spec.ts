import { Password } from '../../../src/domain/user/password.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import { Username } from '../../../src/domain/user/username.js';

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
});

describe('UserId', () => {
  it('should_reject_user_id_when_value_is_empty', () => {
    expect(() => UserId.from('')).toThrow('A UserId needs a value.');
  });

  it('should_be_equal_when_two_user_ids_hold_the_same_value', () => {
    expect(UserId.from('user-1').value).toBe('user-1');
    expect(UserId.from('user-1').equals(UserId.from('user-1'))).toBe(true);
    expect(UserId.from('user-1').equals(UserId.from('user-2'))).toBe(false);
  });
});
