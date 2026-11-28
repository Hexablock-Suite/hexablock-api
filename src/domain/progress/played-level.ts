import type { GameId } from '../shared/game-id.js';
import type { LevelId } from '../shared/level-id.js';
import type { Stars } from '../shared/stars.js';

// The level of a result, as the progress sees it (#290). A LevelResult asks
// it two questions and reads nothing else. The progress declares this
// contract, so progress/ imports nothing from level/: the class of
// 2026-11-13 designs each aggregate as if it ran on its own server.
// LevelDefinition has both operations, so a level fits this interface and
// level/ imports nothing from progress/ either.
export interface PlayedLevel {
  // Tells if the level has this gameId and this levelId.
  isIdentifiedBy(gameId: GameId, levelId: LevelId): boolean;

  // The most stars that a play of the level can carry (DS-6, #135).
  mostStars(): Stars;
}
