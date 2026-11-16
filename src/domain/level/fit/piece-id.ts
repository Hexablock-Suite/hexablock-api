import { err, ok, type Result } from '../../shared/result.js';
import type { ValueReceiver } from '../../shared/value-receiver.js';
import type { LevelProblem } from '../level-problem.js';

// Value object for the id of one piece of a Fit level, such as a. The witness
// names each piece by its id. The id is a non-blank text, kept as it arrives.
export class PieceId {
  private constructor(private readonly value: string) {}

  // The raw value comes from the raw section of a level, so the factory checks its type.
  static of(raw: unknown): Result<PieceId, LevelProblem> {
    return typeof raw === 'string' && raw.trim() !== ''
      ? ok(new PieceId(raw))
      : err('invalid-piece-id');
  }

  // Delivers the value to a receiver of the border. No operation returns it.
  deliverTo(receiver: ValueReceiver<string>): void {
    receiver.receive(this.value);
  }

  equals(other: PieceId): boolean {
    return this.value === other.value;
  }
}
