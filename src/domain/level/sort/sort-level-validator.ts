import type { Result } from '../../shared/result.js';
import type { LevelProblem } from '../level-problem.js';
import type { LevelValidator } from '../level-validator.js';
import type { TopologyId } from '../topology-id.js';
import { SortSection } from './sort-section.js';

// The strategy of the Sort variant (§3.3, DS-6, decision 5). It only picks
// SortSection and asks it to read the section as it arrives. SortSection
// checks its own shape and holds its own rules, so this class holds no rule.
// The composition root registers it under the Sort gameId.
export class SortLevelValidator implements LevelValidator<SortSection> {
  // No rule of the Sort section needs the topology, so the section does not
  // get it. A failed section gives its own level problem: a negative star
  // threshold gives invalid-stars, never a thrown error.
  sectionOf(raw: unknown, _topology: TopologyId): Result<SortSection, LevelProblem> {
    return SortSection.of(raw);
  }
}
