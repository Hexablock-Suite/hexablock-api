// Right example: an adapter calls the three delivery operations. The border
// is the one place that receives the values of a domain object.
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

export const received: (string | number)[] = [];

username.deliverTo({
  receive(value) {
    received.push(value);
  },
});
username.deliverKeyTo({
  receive(value) {
    received.push(value);
  },
});
length.deliverBoundsTo({
  receive(min, max) {
    received.push(min, max);
  },
});
