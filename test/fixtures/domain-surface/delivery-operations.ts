import type { BoundsReceiver } from '../../../src/domain/shared/bounds-receiver.js';
import type { ValueReceiver } from '../../../src/domain/shared/value-receiver.js';

// Right example: the three delivery operations pass a primitive to a receiver
// of the border (decision 15). sendTo() has the same shape and another name,
// so it is a wrong example.
export class Span {
  private constructor(
    private readonly label: string,
    private readonly min: number,
    private readonly max: number,
  ) {}

  deliverTo(receiver: ValueReceiver<string>): void {
    receiver.receive(this.label);
  }

  deliverKeyTo(receiver: ValueReceiver<string>): void {
    receiver.receive(this.label.toLowerCase());
  }

  deliverBoundsTo(receiver: BoundsReceiver<number>): void {
    receiver.receive(this.min, this.max);
  }

  sendTo(receiver: ValueReceiver<number>): void {
    receiver.receive(this.max - this.min);
  }
}
