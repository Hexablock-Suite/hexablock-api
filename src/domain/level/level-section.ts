import { Stars } from '../shared/stars.js';

// The part that every section of a level holds, whatever its game: the star
// thresholds (DS-6). The stars are cumulative, so a play gets one star for
// each leading threshold that it meets, and the most stars of a play is the
// count of thresholds (decided on #134, built on #135). FitSection and
// SortSection implement it.
export interface LevelSection {
  mostStars(): Stars;
}

// The most stars of a list of star thresholds: its count. A count is a
// non-negative safe integer, so a failed Result is a defect of the code.
export function mostStarsOf(thresholds: readonly unknown[]): Stars {
  const most = Stars.of(thresholds.length);
  if (!most.ok) {
    throw new RangeError(`The count of star thresholds breaks the rule ${most.error}.`);
  }
  return most.value;
}
