// Port. It makes and checks password hashes, so the use cases import no
// crypto library (API-NFR-11).
export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
}

// Injection token for the PasswordHasher port. It is a plain symbol, as CLOCK is.
export const PASSWORD_HASHER = Symbol('PasswordHasher');
