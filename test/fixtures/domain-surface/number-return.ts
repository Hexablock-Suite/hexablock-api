import type { Range } from '../../../src/domain/shared/range.js';

// Wrong example: a number in three public return types. A private field may
// hold a number.
export class Counter {
  private constructor(
    private readonly total: number,
    private readonly limits: Range<number>,
  ) {}

  count(): number {
    return this.total;
  }

  limitsOf(): Range<number> {
    return this.limits;
  }
}

export type Order<T> = (left: T, right: T) => number;
