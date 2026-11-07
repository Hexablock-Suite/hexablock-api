// Identity of a User. The application gets a new one from its generator port.
export class UserId {
  private constructor(readonly value: string) {}

  static from(value: string): UserId {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error('A UserId needs a value.');
    }
    return new UserId(value);
  }

  equals(other: UserId): boolean {
    return this.value === other.value;
  }
}
