import type { Password } from '../../domain/user/password.js';
import type { PasswordHash } from '../../domain/user/password-hash.js';
import type { PasswordVerifier } from '../../domain/user/password-verifier.js';

// Port. It makes and checks password hashes, so the use cases import no
// crypto library (API-NFR-11). It carries domain types, so a use case reads
// no text of a Password or of a PasswordHash: only the adapter receives it.
// It extends the domain interface PasswordVerifier, which gives it
// verify(typed, hash). So a use case passes the port to
// User.passwordMatches(), and the user gives its own hash to the check.
export interface PasswordHasher extends PasswordVerifier {
  hash(password: Password): Promise<PasswordHash>;
}

// Injection token for the PasswordHasher port. It is a plain symbol, as CLOCK is.
export const PASSWORD_HASHER = Symbol('PasswordHasher');
