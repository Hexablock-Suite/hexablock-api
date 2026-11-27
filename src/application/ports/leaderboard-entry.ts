import type { BoardEntry } from '../../domain/progress/ranked-board.js';

// One row of a leaderboard (API-FR-03): the player, the Username of the
// account of the player and the domain value that ranks the player. TResult
// is the LevelResult of the board of one level, the Score of the global board
// of Lines and Merge, or the Standing of the global board of Fit and Sort.
// The Username lets a client show a name on the board (#230, option A of
// hexablock-app#47).
// It is a response type of layer 2 with no rule of its own. Each order lives
// in the value object that TResult names (classes.md decision 2). It is an
// alias of BoardEntry of the domain, the type that RankedBoard.of() takes,
// so the shape has one declaration (#213). The alias adds no bound on
// TResult.
export type LeaderboardEntry<TResult> = BoardEntry<TResult>;
