// A value that knows its place in one total order. A Range<T> asks its
// bounds and its values only through these two questions, so no number order
// crosses a public signature of the domain (#99). Of two values that are not
// equal, one is after the other.
export interface Ordered<T> {
  isAfter(other: T): boolean;
  equals(other: T): boolean;
}
