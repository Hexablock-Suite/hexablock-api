import { HexTopology } from '../../../src/domain/level/hex-topology.js';
import { Topologies } from '../../../src/domain/level/topologies.js';
import { TopologyId } from '../../../src/domain/level/topology-id.js';
import { valueOf } from '../../support/level-format.js';

// The rules of hex, square and triangle (decision 6, docs/level-format.md)
// enter through LevelValidators.check(), in level-validators-check.spec.ts
// (#255): which coordinates are cells, how a rotation turns a cell and how an
// offset moves it. So do the rules of Topologies.find(): a TopologyId built
// again finds its topology, and a topology with no entry gives
// unknown-topology. One case stays here: check() takes a registry that the
// composition root built, so it never builds Topologies with two entries for
// one topology.
describe('Topologies', () => {
  // Two entries for one topology are a defect of the composition root, not a
  // datum of a level, so the factory throws.
  it('should_throw_when_two_entries_name_one_topology', () => {
    const entries = [
      [valueOf(TopologyId.of('hex')), new HexTopology()],
      [valueOf(TopologyId.of('hex')), new HexTopology()],
    ] as const;

    expect(() => Topologies.of(entries)).toThrow(
      new RangeError('Topologies takes one topology per topologyId.'),
    );
  });
});
