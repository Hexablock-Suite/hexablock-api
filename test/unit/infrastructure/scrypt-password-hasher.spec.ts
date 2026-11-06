import { ScryptPasswordHasher } from '../../../src/infrastructure/auth/scrypt-password-hasher.js';

const PASSWORD = 'correct horse battery';

describe('ScryptPasswordHasher', () => {
  const hasher = new ScryptPasswordHasher();

  it('should_return_salted_scrypt_hash_without_plain_password_when_password_is_hashed', async () => {
    const first = await hasher.hash(PASSWORD);
    const second = await hasher.hash(PASSWORD);

    expect(first).toMatch(/^scrypt\$16384\$8\$1\$[\w-]+\$[\w-]+$/);
    expect(first).not.toContain(PASSWORD);
    expect(second).not.toBe(first);
  });

  it('should_accept_password_when_hash_comes_from_same_password', async () => {
    const hash = await hasher.hash(PASSWORD);

    expect(await hasher.verify(PASSWORD, hash)).toBe(true);
  });

  it('should_reject_password_when_it_differs_from_hashed_one', async () => {
    const hash = await hasher.hash(PASSWORD);

    expect(await hasher.verify('wrong password', hash)).toBe(false);
  });

  it('should_reject_password_when_hash_is_malformed', async () => {
    for (const hash of ['', 'plain text', 'scrypt$1$2$3$salt', 'bcrypt$16384$8$1$c2FsdA$aGFzaA']) {
      expect(await hasher.verify(PASSWORD, hash)).toBe(false);
    }
  });
});
