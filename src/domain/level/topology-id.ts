import { err, ok, type Result } from '../shared/result.js';
import type { ValueReceiver } from '../shared/value-receiver.js';
import type { LevelProblem } from './level-problem.js';

// A lowercase slug, such as hex, square or triangle.
const TOPOLOGY_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

// Value object for the topology of a level (DS-6). It names how to read the
// coordinates of the level. It is an open value, not a closed list (decision
// 6): a new topology adds no code here, and the API never rejects a level only
// because its topology is not hex.
export class TopologyId {
  private constructor(private readonly value: string) {}

  static of(value: string): Result<TopologyId, LevelProblem> {
    return typeof value === 'string' && TOPOLOGY_ID_PATTERN.test(value)
      ? ok(new TopologyId(value))
      : err('invalid-topology');
  }

  // Delivers the value to a receiver of the border. No operation returns it.
  deliverTo(receiver: ValueReceiver<string>): void {
    receiver.receive(this.value);
  }

  equals(other: TopologyId): boolean {
    return this.value === other.value;
  }
}
