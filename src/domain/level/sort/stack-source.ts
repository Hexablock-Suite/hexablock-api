import { err, ok, type Result } from '../../shared/result.js';
import type { LevelProblem } from '../level-problem.js';
import type { ValueReceiver } from '../../shared/value-receiver.js';
import { readFields, readList, sameItems } from '../parts.js';
import { Seed } from './seed.js';
import { TileColor } from './tile-color.js';

// The data of a seeded source: the seed and the colors that a draw picks from.
interface SeededStacks {
  readonly seed: Seed;
  readonly colors: readonly TileColor[];
}

// The data of a fixed source: the stacks in their order. Each stack lists its
// tiles from the bottom tile to the top tile.
interface FixedStacks {
  readonly stacks: readonly (readonly TileColor[])[];
}

// Value object for the piece source of a Sort level (app A4). A level picks
// one of two kinds: a seeded source, or a fixed list of stacks.
export class StackSource {
  private constructor(private readonly supply: SeededStacks | FixedStacks) {}

  // Reads { seed, colors } or { stacks }. Each list holds one item or more.
  // A raw source of neither kind, or of both kinds, gives invalid-source. A
  // broken seed, color or stack gives invalid-source too: the client sees the
  // field, not the part code (decision 11, #223).
  static of(raw: unknown): Result<StackSource, LevelProblem> {
    const seeded = readFields<SeededStacks>(
      raw,
      { seed: (value) => Seed.of(value), colors: (value) => readColors(value) },
      'invalid-source',
    );
    if (seeded.ok) {
      return ok(new StackSource(seeded.value));
    }
    const fixed = readFields<FixedStacks>(
      raw,
      { stacks: (value) => readList(value, (stack) => readColors(stack), 'invalid-source') },
      'invalid-source',
    );
    return fixed.ok ? ok(new StackSource(fixed.value)) : err('invalid-source');
  }

  // Delivers the data of its kind to a receiver of the border, the mirror of
  // of(): { seed, colors } or { stacks }. No operation returns them.
  deliverTo(
    receiver: ValueReceiver<
      | { readonly seed: Seed; readonly colors: readonly TileColor[] }
      | { readonly stacks: readonly (readonly TileColor[])[] }
    >,
  ): void {
    receiver.receive({ ...this.supply });
  }

  // Two sources are equal when they are of the same kind and hold equal data
  // in the same order. A draw picks a color by its place in the list, and a
  // fixed source gives its stacks in their order.
  equals(other: StackSource): boolean {
    const mine = this.supply;
    const theirs = other.supply;
    if ('stacks' in mine) {
      return 'stacks' in theirs && sameItems(mine.stacks, theirs.stacks, sameColors);
    }
    return (
      'seed' in theirs && mine.seed.equals(theirs.seed) && sameColors(mine.colors, theirs.colors)
    );
  }
}

function readColors(raw: unknown): Result<readonly TileColor[], LevelProblem> {
  return readList(raw, (color) => TileColor.of(color), 'invalid-source');
}

function sameColors(left: readonly TileColor[], right: readonly TileColor[]): boolean {
  return sameItems(left, right, (color, otherColor) => color.equals(otherColor));
}
