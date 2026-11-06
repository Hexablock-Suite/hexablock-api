import { ProgressError } from '../../../src/domain/progress/progress-error.js';
import { UserId } from '../../../src/domain/progress/user-id.js';

describe('UserId', () => {
  it('should_keep_the_value_when_value_is_not_blank', () => {
    expect(UserId.of('user-1').value).toBe('user-1');
  });

  it('should_reject_user_id_when_value_is_missing_or_blank', () => {
    for (const value of [undefined, null, '', '   ', 42]) {
      expect(() => UserId.of(value as unknown as string)).toThrow(ProgressError);
    }
  });

  it('should_be_equal_when_two_user_ids_hold_the_same_value', () => {
    expect(UserId.of('user-1').equals(UserId.of('user-1'))).toBe(true);
    expect(UserId.of('user-1').equals(UserId.of('user-2'))).toBe(false);
  });
});
