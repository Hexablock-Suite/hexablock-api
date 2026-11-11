import type { BoundsReceiver } from '../domain/shared/bounds-receiver.js';
import type { ValueReceiver } from '../domain/shared/value-receiver.js';

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

export interface Bounds<T> {
  readonly min: T;
  readonly max: T;
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
