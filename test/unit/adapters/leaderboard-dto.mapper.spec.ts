import { LeaderboardDtoMapper } from '../../../src/adapters/http/leaderboard-dto.mapper.js';
import { GameId } from '../../../src/domain/progress/game-id.js';
import { LevelId } from '../../../src/domain/progress/level-id.js';
import { valueOf } from '../../support/result.js';

// The mapper writes the text of the one failed Result of the board of a
// level. The controller only picks the status. The words stay the words of
// the answer before #215.
describe('LeaderboardDtoMapper.toProblemDetails', () => {
  it('should_name_the_level_and_the_game_id_when_the_definitions_do_not_hold_the_level', () => {
    const query = {
      gameId: valueOf(GameId.of('hexa-fit')),
      levelId: valueOf(LevelId.of('no-such-level')),
    };

    expect(LeaderboardDtoMapper.toProblemDetails({ kind: 'unknown-level' }, query)).toEqual([
      'No level no-such-level for gameId hexa-fit',
    ]);
  });
});
