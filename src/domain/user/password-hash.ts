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
}
