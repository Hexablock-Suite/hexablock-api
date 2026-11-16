import { err, ok, type Result } from '../../shared/result.js';
import type { ValueReceiver } from '../../shared/value-receiver.js';
import type { LevelProblem } from '../level-problem.js';

// The largest seed: the largest unsigned 32-bit integer, as the app seeds take.
const MAX_SEED = 0xffffffff;

// Value object for the seed of a seeded Sort source. The same seed gives the
// same stacks in the app (APP-NFR-07). A seed is a whole number from 0 to
// 4294967295. A negative zero is stored as 0.
export class Seed {
  private constructor(private readonly value: number) {}

  // The raw value comes from the raw section of a level, so the factory checks its type.
  static of(raw: unknown): Result<Seed, LevelProblem> {
    return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= MAX_SEED
      ? ok(new Seed(0 + raw))
      : err('invalid-seed');
  }

  // Delivers the value to a receiver of the border. No operation returns it.
  deliverTo(receiver: ValueReceiver<number>): void {
    receiver.receive(this.value);
  }

  equals(other: Seed): boolean {
    return this.value === other.value;
  }
}
