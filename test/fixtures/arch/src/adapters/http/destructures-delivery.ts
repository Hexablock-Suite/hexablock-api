// Right example: an adapter destructures the three delivery operations. The
// border is the one place that receives the values of a domain object.
const username = {
  deliverTo(this: void, receiver: { receive(value: string): void }): void {
    receiver.receive('Ada');
  },
  deliverKeyTo(this: void, receiver: { receive(value: string): void }): void {
    receiver.receive('ada');
  },
};
const length = {
  deliverBoundsTo(this: void, receiver: { receive(min: number, max: number): void }): void {
    receiver.receive(3, 32);
  },
};

export const { deliverTo } = username;
export const { deliverKeyTo: deliverKey } = username;

export function boundsDeliveryOf({ deliverBoundsTo }: typeof length): unknown {
  return deliverBoundsTo;
}
