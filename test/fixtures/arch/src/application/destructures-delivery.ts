// Wrong example: the application destructures the three delivery operations.
// A destructured operation opens the way to the value without a member access.
const username = {
  deliverTo(receiver: { receive(value: string): void }): void {
    receiver.receive('Ada');
  },
  deliverKeyTo(receiver: { receive(value: string): void }): void {
    receiver.receive('ada');
  },
};
const length = {
  deliverBoundsTo(receiver: { receive(min: number, max: number): void }): void {
    receiver.receive(3, 32);
  },
};

// Right example: a class declares a delivery operation. The rule accepts it.
export class Stars {
  deliverTo(receiver: { receive(value: number): void }): void {
    receiver.receive(3);
  }
}

export const { deliverTo } = username;
export const { deliverKeyTo: deliverKey } = username;

export function boundsDeliveryOf({ deliverBoundsTo }: typeof length): unknown {
  return deliverBoundsTo;
}
