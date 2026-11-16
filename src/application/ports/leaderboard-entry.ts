import type { UserId } from '../../domain/user/user-id.js';

// One row of a leaderboard (API-FR-03): the player and the domain value that
// ranks the player. TResult is the LevelResult of the board of one level, the
// Score of the global board of Lines and Merge, or the Standing of the global
// board of Fit and Sort. The entry names the player by UserId only: no
// requirement asks for a player name on the board.
// It is a response type of layer 2 with no rule of its own. Each order lives
// in the value object that TResult names (classes.md decision 2).
export interface LeaderboardEntry<TResult> {
  readonly userId: UserId;
  readonly result: TResult;
}
