import { Password } from '../../../src/domain/user/password.js';
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
