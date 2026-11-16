// The code of the rule that a level breaks (decision 11). The border writes
// the message, so the code carries no text that a client sent.
// - game-without-levels: no strategy serves the gameId, as for Lines and Merge.
// - invalid-order, invalid-version, invalid-topology: a value of the common part.
// - invalid-section: the section is not an object with exactly its fields.
// - invalid-figure, invalid-pieces, invalid-witness, invalid-stars: a field of the Fit section.
// - invalid-radius, invalid-goals, invalid-source, invalid-stars: a field of the Sort section.
// - The other codes name the value object whose rule breaks, when a caller builds it alone.
export type LevelProblem =
  | 'game-without-levels'
  | 'invalid-order'
  | 'invalid-version'
  | 'invalid-topology'
  | 'invalid-coordinate'
  | 'invalid-section'
  | 'invalid-figure'
  | 'invalid-pieces'
  | 'invalid-witness'
  | 'invalid-stars'
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
