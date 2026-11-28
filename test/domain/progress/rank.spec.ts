import { Rank } from '../../../src/domain/progress/rank.js';

// The rank of one row of a leaderboard. It is a whole number of 1 or more:
// 1 plus the number of rows that are strictly better (#195, option B). The
// two leaderboard use case specs pin the rank of each row, rank 1 and the
// delivery of the value through the use case (#255). The board passes only
// a position of 1 or more, so no use case reaches the rule of the factory,
// and this spec keeps it.
describe('Rank', () => {
  // One failure mechanism (decision 11): a failed Result with the code of
  // the rule, never an exception.
  it.each([0, -1, 1.5])(
    'should_give_the_code_of_the_rule_when_value_is_not_a_whole_number_of_one_or_more',
    (bad) => {
      expect(Rank.of(bad)).toEqual({ ok: false, error: 'invalid-rank' });
    },
  );
});
