// The code of the rule that a level breaks (decision 11). The border writes
// the message, so the code carries no text that a client sent.
// - game-without-levels: no strategy serves the gameId, as for Lines and Merge.
// - invalid-order, invalid-version, invalid-topology: a value of the common part.
// - older-version: the incoming copy of a level has a lower version than the stored copy (S3-10).
// - invalid-section: the section is not an object with exactly its fields.
// - invalid-figure, invalid-pieces, invalid-witness, invalid-stars: a field of the Fit section.
// - invalid-radius, invalid-goals, invalid-source, invalid-stars: a field of the Sort section.
// - unknown-topology: the code knows no Topology for the topology of a Fit level (decision 6).
// - unequal-area, inexact-witness: the Fit section fails A5. The pieces do not have the area
//   of the figure, or the witness does not place each piece once and cover the figure exactly.
// - The other codes name the value object whose rule breaks, when a caller builds it alone.
export type LevelProblem =
  | 'game-without-levels'
  | 'invalid-order'
  | 'invalid-version'
  | 'invalid-topology'
  | 'older-version'
  | 'unknown-topology'
  | 'invalid-coordinate'
  | 'invalid-section'
  | 'invalid-figure'
  | 'invalid-pieces'
  | 'invalid-witness'
  | 'invalid-stars'
  | 'unequal-area'
  | 'inexact-witness'
  | 'invalid-piece'
  | 'invalid-piece-id'
  | 'invalid-placement'
  | 'invalid-rotation'
  | 'invalid-star-threshold'
  | 'invalid-radius'
  | 'invalid-goals'
  | 'invalid-source'
  | 'invalid-seed'
  | 'invalid-color';
