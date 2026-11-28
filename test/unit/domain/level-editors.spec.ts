import { LevelEditors } from '../../../src/domain/user/level-editors.js';
import { UserId } from '../../../src/domain/shared/user-id.js';
import { valueOf } from '../../support/result.js';
import { testUserId } from '../../support/user-ids.js';

const userId = (value: string): UserId => valueOf(UserId.from(value));

// #145: the accounts that may update the levels, by their user ids.
//
// #255: AuthorizationAspect holds includes(): a listed id passes, another id
// and every id of an empty list fail. User holds the letter case of an id.
// The case below stays, because no root and no use case reaches its rule:
// the one caller of of() builds a new array and never changes it.
describe('LevelEditors', () => {
  // The list keeps its own copy, so a later change to the array of the
  // caller changes nothing.
  it('should_keep_its_ids_when_the_caller_changes_the_array_after_of', () => {
    const ids = [userId(testUserId(1))];
    const editors = LevelEditors.of(ids);

    ids.length = 0;

    expect(editors.includes(userId(testUserId(1)))).toBe(true);
  });
});
