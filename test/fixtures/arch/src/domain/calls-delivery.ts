// Wrong example: a domain object calls a delivery operation of another one.
// Inside the domain, an object compares with equals() or a business operation.
const score = {
  deliverTo(receiver: { receive(value: number): void }): void {
    receiver.receive(120);
  },
};

export const received: number[] = [];

score.deliverTo({
  receive(value) {
    received.push(value);
  },
});
