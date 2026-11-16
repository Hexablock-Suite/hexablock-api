// Wrong example: a number in three public return types. A private field may
// hold a number.
export class Counter {
  private constructor(
    private readonly total: number,
    private readonly limits: ReadonlySet<number>,
  ) {}

  count(): number {
    return this.total;
  }

  limitsOf(): ReadonlySet<number> {
    return this.limits;
  }
}

export type Order<T> = (left: T, right: T) => number;
