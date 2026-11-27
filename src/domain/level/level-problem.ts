// The code of the rule that a level breaks (decision 11). For a level
// problem, the code is the message: the border writes the name of the level
// and the code. The code carries no text that a client sent.
// A client sees 16 codes through PUT /v1/levels (#223):
// - game-without-levels: no strategy serves the gameId, as for Lines and Merge.
// - invalid-order, invalid-version, invalid-topology: a value of the common part.
// - older-version: the incoming copy of a level has a lower version than the stored copy (S3-10).
// - invalid-section: the section is not an object with exactly its fields.
// - invalid-figure, invalid-pieces, invalid-witness, invalid-stars: a field of the Fit section.
// - invalid-radius, invalid-goals, invalid-source, invalid-stars: a field of the Sort section.
// - unknown-topology: the code knows no Topology for the topology of a Fit level (decision 6).
// - unequal-area, inexact-witness: the Fit section fails A5. The pieces do not have the area
//   of the figure, or the witness does not place each piece once and cover the figure exactly.
// The other eight codes are part codes: invalid-coordinate, invalid-rotation,
// invalid-piece, invalid-piece-id, invalid-placement, invalid-star-threshold,
// invalid-seed and invalid-color. A value object keeps the code of its own
// rule. The section that reads the part gives the code of its field, so no
// client sees a part code. test/domain/level/level-problem.spec.ts classifies
// each code, and a new code fails the type check until it has a class.
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
