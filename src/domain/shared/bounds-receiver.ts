// The receiver of the two bounds of a Range. Range.deliverBoundsTo() calls
// it once, with the lower bound and then the upper bound.
export interface BoundsReceiver<T> {
  receive(min: T, max: T): void;
}
