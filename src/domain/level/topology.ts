import type { Coordinate } from './coordinate.js';
import type { Rotation } from './rotation.js';

// The rules of one topology (decision 6). TopologyId only names a topology.
// A Topology knows which coordinates are its cells, how a rotation turns a
// cell around the origin, and how an offset moves a cell. A5 asks it, so the
// Fit check never assumes the 60° or the plain sum of hex. A new topology
// adds one class and one entry of Topologies in the composition root, and it
// changes no existing class.
export interface Topology {
  // Tells if a coordinate is a cell of this topology, for example [q, r] on hex.
  holds(cell: Coordinate): boolean;

  // Gives the cell that a cell of this topology becomes when it turns around
  // the origin by a count of steps of this topology.
  turn(cell: Coordinate, rotation: Rotation): Coordinate;

  // Gives the cell that a cell of this topology becomes when it moves by the
  // offset `at` of a placement. Each topology says what an offset counts, so
  // a move on triangles keeps the orientation of each cell (#229).
  move(cell: Coordinate, at: Coordinate): Coordinate;
}
