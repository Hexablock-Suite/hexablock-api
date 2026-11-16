import { err, ok, type Result } from '../shared/result.js';
import type { ValueReceiver } from '../shared/value-receiver.js';

// The RFC 9562 text form: 8-4-4-4-12 hexadecimal digits with hyphens. It
// accepts any version and letters in either case.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The code of the broken rule. The border writes the message (decision 11).
export type UserIdProblem = 'invalid-user-id';

// Identity of a User. The application gets a new one from its generator port.
// The value is a UUID, as the uuid columns users.id and progress.user_id ask.
export class UserId {
  private constructor(private readonly value: string) {}

  // An empty or a blank text is not a UUID either, so one code covers it.
  static from(value: string): Result<UserId, UserIdProblem> {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
      return err('invalid-user-id');
    }
    // Postgres returns a uuid in lower case. The same form keeps equals()
    // true for an id that the database reads back.
    return ok(new UserId(value.toLowerCase()));
  }

  // Delivers the id to a receiver of the border, in lower case, as from()
  // keeps it. No operation returns it.
  deliverTo(receiver: ValueReceiver<string>): void {
    receiver.receive(this.value);
  }

  equals(other: UserId): boolean {
    return this.value === other.value;
  }

  // Tells if this id comes first in one fixed order of the ids: the order of
  // their lower case text. A leaderboard lists its full ties in this order,
  // so equal entries always come out in the same order (decision of #83).
  comesBefore(other: UserId): boolean {
    return this.value < other.value;
  }
}
