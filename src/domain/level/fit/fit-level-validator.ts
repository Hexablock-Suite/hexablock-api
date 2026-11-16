import type { Result } from '../../shared/result.js';
import type { LevelProblem } from '../level-problem.js';
import type { LevelValidator } from '../level-validator.js';
import type { Topologies } from '../topologies.js';
import type { TopologyId } from '../topology-id.js';
import { FitSection } from './fit-section.js';

// The strategy of the Fit variant (§3.3, DS-6, decision 5). It only picks
// FitSection and asks it to read the section as it arrives. FitSection checks
// its own shape and holds its own rules, A5 included, so this class holds no
// rule. The composition root registers it under the Fit gameId.
export class FitLevelValidator implements LevelValidator<FitSection> {
  constructor(private readonly topologies: Topologies) {}

  // A5 turns the pieces by the steps of the topology of the level, so the
  // strategy finds that Topology first and gives it to the section (decision
  // 6). A topology with no entry gives unknown-topology. A failed section
  // gives its own level problem: a negative star threshold gives
  // invalid-stars, never a thrown error.
  sectionOf(raw: unknown, topology: TopologyId): Result<FitSection, LevelProblem> {
    const rules = this.topologies.find(topology);
    return rules.ok ? FitSection.of(raw, rules.value) : rules;
  }
}
