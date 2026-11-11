import type { ValueReceiver } from '../shared/value-receiver.js';

// The RFC 9562 text form: 8-4-4-4-12 hexadecimal digits with hyphens. It
// accepts any version and letters in either case.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Identity of a User. The application gets a new one from its generator port.
// The value is a UUID, as the uuid columns users.id and progress.user_id ask.
export class UserId {
  private constructor(private readonly value: string) {}

  static from(value: string): UserId {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error('A UserId needs a value.');
    }
    if (!UUID_PATTERN.test(value)) {
      throw new Error('A UserId must be a UUID.');
    }
    // Postgres returns a uuid in lower case. The same form keeps equals()
    // true for an id that the database reads back.
    return new UserId(value.toLowerCase());
  }

  // Delivers the id to a receiver of the border, in lower case, as from()
  // keeps it. No operation returns it.
  deliverTo(receiver: ValueReceiver<string>): void {
    receiver.receive(this.value);
  }

  equals(other: UserId): boolean {
    return this.value === other.value;
  }
}
