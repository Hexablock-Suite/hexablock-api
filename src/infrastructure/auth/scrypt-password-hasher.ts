import { randomBytes, scrypt, type ScryptOptions, timingSafeEqual } from 'node:crypto';
import { receiveValueOf } from '../../adapters/received.js';
import type { PasswordHasher } from '../../application/ports/password-hasher.js';
import type { Password } from '../../domain/user/password.js';
import { PasswordHash } from '../../domain/user/password-hash.js';

// The scrypt cost of node:crypto's default. The hash keeps its parameters,
// so a later change of cost still verifies the old hashes.
const COST = { N: 16384, r: 8, p: 1 } as const;
const SALT_BYTES = 16;
const KEY_BYTES = 64;
const SCHEME = 'scrypt';

function derive(plain: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(plain, salt, KEY_BYTES, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

// Adapter of the PasswordHasher port with scrypt from node:crypto. The
// stored form is scrypt$N$r$p$<salt>$<key>, with base64url salt and key.
// It is the one place that receives the text of a Password and of a PasswordHash.
export class ScryptPasswordHasher implements PasswordHasher {
  async hash(password: Password): Promise<PasswordHash> {
    const salt = randomBytes(SALT_BYTES);
    const key = await derive(receiveValueOf(password), salt, COST);
    const stored = [
      SCHEME,
      COST.N,
      COST.r,
      COST.p,
      salt.toString('base64url'),
      key.toString('base64url'),
    ].join('$');
    return PasswordHash.from(stored);
  }

  // The typed text is a plain string: a wrong password can be shorter than any Password.
  async verify(typed: string, hash: PasswordHash): Promise<boolean> {
    const parts = receiveValueOf(hash).split('$');
    if (parts.length !== 6 || parts[0] !== SCHEME) {
      return false;
    }
    const [N, r, p] = parts.slice(1, 4).map(Number);
    const salt = Buffer.from(parts[4], 'base64url');
    const expected = Buffer.from(parts[5], 'base64url');
    if (
      ![N, r, p].every(Number.isSafeInteger) ||
      salt.length === 0 ||
      expected.length !== KEY_BYTES
    ) {
      return false;
    }
    const actual = await derive(typed, salt, { N, r, p });
    return timingSafeEqual(actual, expected);
  }
}
