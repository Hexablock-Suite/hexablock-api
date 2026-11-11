// The receiver of the datum of a value object. A value object keeps its
// datum private and delivers it with deliverTo(). No operation returns the
// datum. Only an adapter or the infrastructure implements a receiver that
// keeps the datum: a row mapper, a DTO mapper, a repository or a signer.
export interface ValueReceiver<T> {
  receive(value: T): void;
}
