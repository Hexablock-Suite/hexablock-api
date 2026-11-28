import type { LevelResult } from '../../src/domain/progress/level-result.js';
import type { PlayerProgress } from '../../src/domain/progress/player-progress.js';
import type { ProgressKey } from '../../src/domain/progress/progress-key.js';
import type { Score } from '../../src/domain/progress/score.js';
import type { SyncInstant } from '../../src/domain/progress/sync-instant.js';
import type { BoundsReceiver } from '../../src/domain/shared/bounds-receiver.js';
import type { ValueReceiver } from '../../src/domain/shared/value-receiver.js';
import type { PasswordHash } from '../../src/domain/user/password-hash.js';
import type { User } from '../../src/domain/user/user.js';
import type { UserId } from '../../src/domain/shared/user-id.js';
import type { Username } from '../../src/domain/shared/username.js';

// Test double for a ValueReceiver. It keeps every value that it receives,
// in order, so a test sees the value and the number of deliveries.
export class RecordingReceiver<T> implements ValueReceiver<T> {
  readonly received: T[] = [];

  receive(value: T): void {
    this.received.push(value);
  }
}

// Test double for a BoundsReceiver. It keeps each pair of bounds.
export class RecordingBoundsReceiver<T> implements BoundsReceiver<T> {
  readonly received: (readonly [T, T])[] = [];

  receive(min: T, max: T): void {
    this.received.push([min, max]);
  }
}

// Runs one delivery and gives every value that the receiver got.
export function deliveredBy<T>(source: { deliverTo(receiver: ValueReceiver<T>): void }): T[] {
  const receiver = new RecordingReceiver<T>();
  source.deliverTo(receiver);
  return receiver.received;
}

// The same for the key of a Username.
export function keyDeliveredBy<T>(source: { deliverKeyTo(receiver: ValueReceiver<T>): void }): T[] {
  const receiver = new RecordingReceiver<T>();
  source.deliverKeyTo(receiver);
  return receiver.received;
}

// The same for the bounds of a Range.
export function boundsDeliveredBy<T>(source: {
  deliverBoundsTo(receiver: BoundsReceiver<T>): void;
}): (readonly [T, T])[] {
  const receiver = new RecordingBoundsReceiver<T>();
  source.deliverBoundsTo(receiver);
  return receiver.received;
}

// The parts that one delivery of a PlayerProgress gives, as domain values.
export interface ProgressParts {
  readonly key: ProgressKey;
  readonly highScore: Score | null;
  readonly updatedAt: SyncInstant;
  readonly results: readonly LevelResult[];
}

// The parts that one delivery of a User gives, as domain values.
export interface UserParts {
  readonly id: UserId;
  readonly username: Username;
  readonly passwordHash: PasswordHash;
}

// Runs one delivery of a progress and gives its parts. A progress that a
// repository does not find gives undefined, so a test reads it with ?.
export function progressPartsOf(progress: PlayerProgress): ProgressParts;
export function progressPartsOf(
  progress: PlayerProgress | null | undefined,
): ProgressParts | undefined;
export function progressPartsOf(
  progress: PlayerProgress | null | undefined,
): ProgressParts | undefined {
  if (progress === null || progress === undefined) {
    return undefined;
  }
  const received: ProgressParts[] = [];
  progress.deliverTo({
    receive(key, highScore, updatedAt, results) {
      received.push({ key, highScore, updatedAt, results });
    },
  });
  return onlyDelivery(received);
}

// Runs one delivery of a user and gives its parts.
export function userPartsOf(user: User): UserParts {
  const received: UserParts[] = [];
  user.deliverTo({
    receive(id, username, passwordHash) {
      received.push({ id, username, passwordHash });
    },
  });
  return onlyDelivery(received);
}

// An aggregate delivers its parts in exactly one call.
function onlyDelivery<T>(received: readonly T[]): T {
  if (received.length !== 1) {
    throw new Error(`The aggregate delivered its parts ${received.length} times.`);
  }
  return received[0];
}
