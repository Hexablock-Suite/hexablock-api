import { err, ok, type Result } from '../shared/result.js';
import type { LevelProblem } from './level-problem.js';
import type { Topology } from './topology.js';
import type { TopologyId } from './topology-id.js';

// One entry of the collection: the id of a topology and its rules.
export type TopologyEntry = readonly [TopologyId, Topology];

// The topologies that the code knows (decision 6, DS-6). FitLevelValidator
// asks it for the Topology of a level. The composition root builds it once,
// with one entry per known topology, and it keeps no state that changes.
// It finds a topology with TopologyId.equals(), never with a Map: a Map
// compares object keys by reference, so two equal TopologyId values would
// be two keys.
export class Topologies {
  private constructor(private readonly entries: readonly TopologyEntry[]) {}

  // Two entries for one topology are a defect of the composition root, not a
  // datum of a level, so this guard throws.
  static of(entries: readonly TopologyEntry[]): Topologies {
    const repeated = entries.some(([id], index) =>
      entries.slice(0, index).some(([earlier]) => earlier.equals(id)),
    );
    if (repeated) {
      throw new RangeError('Topologies takes one topology per topologyId.');
    }
    return new Topologies(Object.freeze([...entries]));
  }

  // Finds the rules of a topology. A topology with no entry has no rules
  // here, so a level of that topology gives unknown-topology.
  find(id: TopologyId): Result<Topology, LevelProblem> {
    const entry = this.entries.find(([known]) => known.equals(id));
    if (entry === undefined) {
      return err('unknown-topology');
    }
    const [, topology] = entry;
    return ok(topology);
  }
}
