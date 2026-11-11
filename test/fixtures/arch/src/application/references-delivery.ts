// Wrong example: the application takes a delivery operation without a call.
// A bound or a computed reference still opens the way to the value.
const score = {
  deliverTo(receiver: { receive(value: number): void }): void {
    receiver.receive(120);
  },
};

export const bound = score.deliverTo.bind(score);
export const computed = score['deliverTo'];
