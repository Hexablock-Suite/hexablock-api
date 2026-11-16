import type { LevelResultReceiver } from '../domain/progress/level-result.js';
import type { PlayerProgressReceiver } from '../domain/progress/player-progress.js';
import type { BoundsReceiver } from '../domain/shared/bounds-receiver.js';
import type { ValueReceiver } from '../domain/shared/value-receiver.js';
import type { UserReceiver } from '../domain/user/user.js';

// The helpers of the border. A value object keeps its datum private and
// delivers it to a receiver. An adapter often needs the datum as an
// expression: a row field, an SQL filter, a lock key or a token claim. Each
// helper runs one delivery and gives what the receiver got. They live in
// src/adapters, so the domain and the application cannot import them. The
// lint rule hexablock/no-delivery-call keeps every delivery out of those layers.

// A domain object that delivers one value.
interface DeliversValue<T> {
  deliverTo(receiver: ValueReceiver<T>): void;
}

// A domain object that delivers a key, such as Username.
interface DeliversKey<T> {
  deliverKeyTo(receiver: ValueReceiver<T>): void;
}

// A domain object that delivers two bounds, such as Range.
interface DeliversBounds<T> {
  deliverBoundsTo(receiver: BoundsReceiver<T>): void;
}

// A domain object that delivers the four values of a level result.
interface DeliversLevelResult {
  deliverTo(receiver: LevelResultReceiver): void;
}

// An aggregate that delivers the parts of a progress, such as PlayerProgress.
interface DeliversProgress {
  deliverTo(receiver: PlayerProgressReceiver<Date>): void;
}

// An aggregate that delivers the parts of a user, such as User.
interface DeliversUser {
  deliverTo(receiver: UserReceiver): void;
}

export interface Bounds<T> {
  readonly min: T;
  readonly max: T;
}

// The plain values of one level result, as a row or a JSON body keeps them.
export interface LevelResultValues {
  readonly levelId: string;
  readonly stars: number;
  readonly moves: number;
  readonly elapsedMs: number;
}

// The plain values of one progress, as its rows or a JSON body keep them.
// The list is new for each delivery.
export interface ProgressValues {
  readonly userId: string;
  readonly gameId: string;
  readonly highScore: number | null;
  readonly updatedAt: Date;
  readonly results: LevelResultValues[];
}

// The plain values of one user, as its row keeps them. usernameKey is the
// key that the Username delivers.
export interface UserValues {
  readonly id: string;
  readonly username: string;
  readonly usernameKey: string;
  readonly passwordHash: string;
}

// A receiver that keeps the one value of a delivery.
class Slot<T> implements ValueReceiver<T> {
  private kept: { readonly value: T } | null = null;

  receive(value: T): void {
    this.kept = { value };
  }

  // A source that delivers nothing breaks its contract, so the slot throws.
  take(): T {
    if (this.kept === null) {
      throw new Error('The source delivered no value.');
    }
    return this.kept.value;
  }
}

export function receiveValueOf<T>(source: DeliversValue<T>): T {
  const slot = new Slot<T>();
  source.deliverTo(slot);
  return slot.take();
}

export function receiveKeyOf<T>(source: DeliversKey<T>): T {
  const slot = new Slot<T>();
  source.deliverKeyTo(slot);
  return slot.take();
}

export function receiveBoundsOf<T>(source: DeliversBounds<T>): Bounds<T> {
  const slot = new Slot<Bounds<T>>();
  source.deliverBoundsTo({
    receive(min, max) {
      slot.receive({ min, max });
    },
  });
  return slot.take();
}

// A level result delivers its four value objects in one call. The helper
// receives the datum of each one, in the order of the fields.
export function receiveLevelResultOf(source: DeliversLevelResult): LevelResultValues {
  const slot = new Slot<LevelResultValues>();
  source.deliverTo({
    receive(levelId, stars, moves, elapsedTime) {
      slot.receive({
        levelId: receiveValueOf(levelId),
        stars: receiveValueOf(stars),
        moves: receiveValueOf(moves),
        elapsedMs: receiveValueOf(elapsedTime),
      });
    },
  });
  return slot.take();
}

// A progress delivers its parts in one call. The helper receives the datum of
// each value object and the four values of each level result. The Date of
// updatedAt is the new Date that the delivery gives.
export function receiveProgressOf(source: DeliversProgress): ProgressValues {
  const slot = new Slot<ProgressValues>();
  source.deliverTo({
    receive(userId, gameId, highScore, updatedAt, results) {
      slot.receive({
        userId: receiveValueOf(userId),
        gameId: receiveValueOf(gameId),
        highScore: highScore === null ? null : receiveValueOf(highScore),
        updatedAt,
        results: results.map((result) => receiveLevelResultOf(result)),
      });
    },
  });
  return slot.take();
}

// A user delivers its parts in one call. The helper receives the datum of
// each value object and the key of the Username.
export function receiveUserOf(source: DeliversUser): UserValues {
  const slot = new Slot<UserValues>();
  source.deliverTo({
    receive(id, username, passwordHash) {
      slot.receive({
        id: receiveValueOf(id),
        username: receiveValueOf(username),
        usernameKey: receiveKeyOf(username),
        passwordHash: receiveValueOf(passwordHash),
      });
    },
  });
  return slot.take();
}
