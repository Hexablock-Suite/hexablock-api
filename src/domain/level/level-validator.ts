import type { Result } from '../shared/result.js';
import type { LevelProblem } from './level-problem.js';
import type { LevelSection } from './level-section.js';
import type { TopologyId } from './topology-id.js';

// The strategy of one variant with level files (§3.3, DS-6, decision 5). It
// only picks the section type of its game and asks it to read the raw
// section. The section checks its own shape and holds its own rules, so the
// strategy holds no rule. SortLevelValidator (#78) and FitLevelValidator
// (#79) implement it.
export interface LevelValidator<TSection extends LevelSection> {
  // Builds the section of a level of its game from the section as it
  // arrives. The topology of the level comes with it, because a rule of the
  // section can need it: A5 rotates the Fit pieces by the steps of the
  // topology (decision 6).
  sectionOf(raw: unknown, topology: TopologyId): Result<TSection, LevelProblem>;
}
