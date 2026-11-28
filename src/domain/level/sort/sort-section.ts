import type { Moves } from '../../shared/moves.js';
import { ok, type Result } from '../../shared/result.js';
import type { LevelProblem } from '../level-problem.js';
import { type LevelSection, mostStarsOf } from '../level-section.js';
import type { Stars } from '../../shared/stars.js';
import type { ValueReceiver } from '../../shared/value-receiver.js';
import { readFields, readList, sameItems } from '../parts.js';
import { maxMovesIn } from '../star-limits.js';
import { BoardRadius } from './board-radius.js';
import { GoalCount } from './goal-count.js';
import { StackSource } from './stack-source.js';

// Value object for the section of a Sort level (DS-6): the board radius, the
// goal, the piece source and the star thresholds. Each star threshold is a
// Moves limit, and the stars are cumulative: star N needs star N-1. The
// section checks its own shape when it is created, so isSection() is gone.
// It holds the rules of the section too, and SortLevelValidator (#78) only
// picks this type.
export class SortSection implements LevelSection {
  private constructor(
    private readonly radius: BoardRadius,
    private readonly goals: GoalCount,
    private readonly source: StackSource,
    private readonly stars: readonly Moves[],
  ) {}

  // Reads { radius, goals, source, stars } from the section as it arrives. A
  // wrong field gives its own level problem, so the border can name the field.
  static of(raw: unknown): Result<SortSection, LevelProblem> {
    const section = readFields(
      raw,
      {
        radius: (value) => BoardRadius.of(value),
        goals: (value) => GoalCount.of(value),
        source: (value) => StackSource.of(value),
        stars: (value) => readList(value, (star) => sortStarIn(star), 'invalid-stars'),
      },
      'invalid-section',
    );
    if (!section.ok) {
      return section;
    }
    const { radius, goals, source, stars } = section.value;
    return ok(new SortSection(radius, goals, source, stars));
  }

  // Delivers the four fields to a receiver of the border, the mirror of of().
  // No operation returns them. Each star is { maxMoves }, as of() reads it.
  deliverTo(
    receiver: ValueReceiver<{
      readonly radius: BoardRadius;
      readonly goals: GoalCount;
      readonly source: StackSource;
      readonly stars: readonly { readonly maxMoves: Moves }[];
    }>,
  ): void {
    receiver.receive({
      radius: this.radius,
      goals: this.goals,
      source: this.source,
      stars: this.stars.map((maxMoves) => ({ maxMoves })),
    });
  }

  // The most stars of a play of this level: the count of its star
  // thresholds (DS-6, #135).
  mostStars(): Stars {
    return mostStarsOf(this.stars);
  }

  // Two sections are equal when every field is equal. The stars compare in order.
  equals(other: SortSection): boolean {
    return (
      this.radius.equals(other.radius) &&
      this.goals.equals(other.goals) &&
      this.source.equals(other.source) &&
      sameItems(this.stars, other.stars, (star, otherStar) => star.equals(otherStar))
    );
  }
}

// Reads one Sort star threshold, { maxMoves }, as its Moves limit.
function sortStarIn(raw: unknown): Result<Moves, LevelProblem> {
  const star = readFields(raw, { maxMoves: maxMovesIn }, 'invalid-star-threshold');
  return star.ok ? ok(star.value.maxMoves) : star;
}
