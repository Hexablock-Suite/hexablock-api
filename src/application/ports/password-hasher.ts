import type { Password } from '../../domain/user/password.js';
import type { PasswordHash } from '../../domain/user/password-hash.js';

// Port. It makes and checks password hashes, so the use cases import no
// crypto library (API-NFR-11). It carries domain types, so a use case reads
// no text of a Password or of a PasswordHash: only the adapter receives it.
export interface PasswordHasher {
  hash(password: Password): Promise<PasswordHash>;
  // The typed text is a plain string, not a Password. A wrong password can
  // be shorter than any Password, and sign-in still checks it against the hash.
  verify(typed: string, hash: PasswordHash): Promise<boolean>;
}

// Injection token for the PasswordHasher port. It is a plain symbol, as CLOCK is.
export const PASSWORD_HASHER = Symbol('PasswordHasher');
