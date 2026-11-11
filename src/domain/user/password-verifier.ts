import type { PasswordHash } from './password-hash.js';

// The check of a typed password against a stored hash. It is an interface of
// the domain: User.passwordMatches() asks it, so no use case reads the hash
// of a user. The port PasswordHasher of the application layer extends it,
// and its adapter does the work. The domain knows no hash algorithm.
export interface PasswordVerifier {
  // The typed text is a plain string, not a Password. A wrong password can
  // be shorter than any Password, and sign-in still checks it against the hash.
  verify(typed: string, hash: PasswordHash): Promise<boolean>;
}
