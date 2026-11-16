import type { ValueReceiver } from '../../../src/domain/shared/value-receiver.js';
import type { UserId } from '../../../src/domain/user/user-id.js';

// Wrong example: three static methods that look like the factory of a value
// object. An aggregate declares no delivery operation, so its factory is not
// the factory of a value object.
export class Session {
  private constructor(private startedAtMs: number) {}

  static begin(at: Date): Session {
    return new Session(at.getTime());
  }
}

// A factory that also takes a domain value does not take the raw value. A
// static query that returns a boolean is not a factory.
export class Badge {
  private constructor(
    private readonly userId: UserId,
    private readonly awardedAtMs: number,
  ) {}

  static award(userId: UserId, at: Date): Badge {
    return new Badge(userId, at.getTime());
  }

  static isTooLong(raw: string): boolean {
    return raw.length > 32;
  }

  deliverTo(receiver: ValueReceiver<number>): void {
    receiver.receive(this.awardedAtMs);
  }

  equals(other: Badge): boolean {
    return this.userId.equals(other.userId) && this.awardedAtMs === other.awardedAtMs;
  }
}
