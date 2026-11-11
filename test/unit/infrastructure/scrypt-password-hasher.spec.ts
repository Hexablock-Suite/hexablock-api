import { receiveValueOf } from '../../../src/adapters/received.js';
import { Password } from '../../../src/domain/user/password.js';
import { PasswordHash } from '../../../src/domain/user/password-hash.js';
import { ScryptPasswordHasher } from '../../../src/infrastructure/auth/scrypt-password-hasher.js';

const PLAIN = 'correct horse battery';

function passwordOf(plain: string): Password {
  const password = Password.create(plain);
  if (!password.ok) throw new Error(password.error);
  return password.value;
}

const PASSWORD = passwordOf(PLAIN);

describe('ScryptPasswordHasher', () => {
  const hasher = new ScryptPasswordHasher();

  it('should_return_salted_scrypt_hash_without_plain_password_when_password_is_hashed', async () => {
    const first = await hasher.hash(PASSWORD);
    const second = await hasher.hash(PASSWORD);

    expect(first).toBeInstanceOf(PasswordHash);
    expect(receiveValueOf(first)).toMatch(/^scrypt\$16384\$8\$1\$[\w-]+\$[\w-]+$/);
    expect(receiveValueOf(first)).not.toContain(PLAIN);
    expect(second.equals(first)).toBe(false);
  });

  it('should_accept_password_when_hash_comes_from_same_password', async () => {
    const hash = await hasher.hash(PASSWORD);

    expect(await hasher.verify(PLAIN, hash)).toBe(true);
  });

  it('should_reject_password_when_it_differs_from_hashed_one', async () => {
    const hash = await hasher.hash(PASSWORD);

    expect(await hasher.verify('wrong password', hash)).toBe(false);
  });

  // The trap of #90: a typed text can be shorter than any Password.
  it('should_reject_typed_text_when_it_is_shorter_than_any_password', async () => {
    const hash = await hasher.hash(PASSWORD);

    expect(await hasher.verify('short', hash)).toBe(false);
  });

  // A PasswordHash is never empty, so the empty text is not a case here.
  it('should_reject_password_when_hash_is_malformed', async () => {
    for (const hash of ['plain text', 'scrypt$1$2$3$salt', 'bcrypt$16384$8$1$c2FsdA$aGFzaA']) {
      expect(await hasher.verify(PLAIN, PasswordHash.from(hash))).toBe(false);
    }
  });
});
