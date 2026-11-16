import { err, ok, type Result } from '../../shared/result.js';
import type { ValueReceiver } from '../../shared/value-receiver.js';
import type { LevelProblem } from '../level-problem.js';

// Value object for the color of one tile of a Sort stack, such as red. The
// name is a non-blank text. It compares as written, as the app compares its colors.
export class TileColor {
  private constructor(private readonly name: string) {}

  // The raw value comes from the raw section of a level, so the factory checks its type.
  static of(raw: unknown): Result<TileColor, LevelProblem> {
    return typeof raw === 'string' && raw.trim() !== ''
      ? ok(new TileColor(raw))
      : err('invalid-color');
  }

  // Delivers the name to a receiver of the border. No operation returns it.
  deliverTo(receiver: ValueReceiver<string>): void {
    receiver.receive(this.name);
  }

  equals(other: TileColor): boolean {
    return this.name === other.name;
  }
}
