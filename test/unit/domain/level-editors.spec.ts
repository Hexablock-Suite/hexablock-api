import { LevelEditors } from '../../../src/domain/user/level-editors.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import { valueOf } from '../../support/result.js';
import { testUserId } from '../../support/user-ids.js';

const userId = (value: string): UserId => valueOf(UserId.from(value));

// #145: the accounts that may update the levels, by their user ids.
describe('LevelEditors', () => {
  it('should_include_a_listed_id_and_exclude_another_id_when_the_list_holds_user_ids', () => {
    const editors = LevelEditors.of([userId(testUserId(1)), userId(testUserId(3))]);

    expect(editors.includes(userId(testUserId(1)))).toBe(true);
    expect(editors.includes(userId(testUserId(3)))).toBe(true);
    expect(editors.includes(userId(testUserId(2)))).toBe(false);
  });

  // UserId keeps the lower case form, so the letter case of a listed id
  // does not matter.
  it('should_include_an_id_when_the_list_holds_it_in_upper_case', () => {
    const upper = 'ABCDEF01-2345-4678-9ABC-DEF012345678';
    const editors = LevelEditors.of([userId(upper)]);

    expect(editors.includes(userId(upper.toLowerCase()))).toBe(true);
  });

  // Fails closed: an empty list lets no account in.
  it('should_include_no_id_when_the_list_is_empty', () => {
    const editors = LevelEditors.of([]);

    expect(editors.includes(userId(testUserId(1)))).toBe(false);
  });

  // The list keeps its own copy, so a later change to the array of the
  // caller changes nothing.
  it('should_keep_its_ids_when_the_caller_changes_the_array_after_of', () => {
    const ids = [userId(testUserId(1))];
    const editors = LevelEditors.of(ids);

    ids.length = 0;

    expect(editors.includes(userId(testUserId(1)))).toBe(true);
  });
});
