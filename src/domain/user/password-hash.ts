// The stored form of a password. The domain never reads its format: only
// the PasswordHasher port makes and checks it.
export class PasswordHash {
  private constructor(readonly value: string) {}

  static from(value: string): PasswordHash {
    if (value.length === 0) {
      throw new Error('A PasswordHash needs a value.');
    }
    return new PasswordHash(value);
  }

  // Two hashes are equal when they hold the same text.
  // Sign-in never uses this method: it checks a password through the PasswordHasher port.
  equals(other: PasswordHash): boolean {
    return this.value === other.value;
  }
}
