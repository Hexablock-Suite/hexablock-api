import type { BoundsReceiver } from '../../src/domain/shared/bounds-receiver.js';
import type { ValueReceiver } from '../../src/domain/shared/value-receiver.js';

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
