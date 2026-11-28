import { ElapsedTime } from '../../../src/domain/shared/elapsed-time.js';
import { LevelsCompleted } from '../../../src/domain/progress/levels-completed.js';
import { Moves } from '../../../src/domain/shared/moves.js';
import { Standing } from '../../../src/domain/progress/standing.js';
import { Stars } from '../../../src/domain/shared/stars.js';
import type { Result } from '../../../src/domain/shared/result.js';
import { valueOf } from '../../support/result.js';

function created<T>(result: Result<T, string>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

// The totals of one player over the levels of one game: stars, levels
// completed, moves and time in milliseconds.
function standing(stars: number, levels: number, moves: number, elapsedMs: number): Standing {
  return created(
    Standing.of(
      valueOf(Stars.of(stars)),
      created(LevelsCompleted.of(levels)),
      valueOf(Moves.of(moves)),
      valueOf(ElapsedTime.ofMs(elapsedMs)),
    ),
  );
}

// The GetGlobalLeaderboard spec pins the delivery of the four totals, each
// step of the order of S3-03 and a full tie through the use case (#255).
// Two rules stay here. The use case takes each Standing built, so it cannot
// reach the rule of the factory. equals() has no caller in src/, so no use
// case reaches it.
describe('Standing', () => {
  // One failure mechanism: a failed Result with the code of the rule, never an exception.
  it('should_give_the_code_of_the_rule_when_no_level_is_completed', () => {
    const result = Standing.of(
      valueOf(Stars.of(0)),
      created(LevelsCompleted.of(0)),
      valueOf(Moves.of(0)),
      valueOf(ElapsedTime.ofMs(0)),
    );

    expect(result).toEqual({ ok: false, error: 'no-level-completed' });
  });

  it('should_be_equal_only_when_all_four_totals_are_equal', () => {
    const first = standing(5, 2, 30, 60_000);

    expect(first.equals(standing(5, 2, 30, 60_000))).toBe(true);
    expect(first.equals(standing(6, 2, 30, 60_000))).toBe(false);
    expect(first.equals(standing(5, 3, 30, 60_000))).toBe(false);
    expect(first.equals(standing(5, 2, 31, 60_000))).toBe(false);
    expect(first.equals(standing(5, 2, 30, 60_001))).toBe(false);
  });
});
