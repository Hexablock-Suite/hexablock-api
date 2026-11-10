import { LevelId } from '../../../src/domain/progress/level-id.js';
import { ProgressError } from '../../../src/domain/progress/progress-error.js';

// The id of one level of a game, such as fit-01.
describe('LevelId', () => {
  it('should_reject_the_id_when_it_is_blank_or_not_a_string', () => {
    for (const bad of [undefined, null, '', '  ', 5, ['fit-01']]) {
      expect(() => LevelId.of(bad as unknown as string)).toThrow(ProgressError);
      expect(() => LevelId.of(bad as unknown as string)).toThrow(
        'levelId must be a non-blank string.',
      );
    }
  });

  // The id is kept as it arrives: letter case and spaces count.
  it('should_be_equal_when_two_ids_hold_the_same_text', () => {
    const id = LevelId.of('fit-01');
    const twin = LevelId.of('fit-01');

    expect(twin).not.toBe(id);
    expect(id.equals(twin)).toBe(true);
    expect(twin.equals(id)).toBe(true);
    for (const other of ['fit-02', 'FIT-01', ' fit-01']) {
      expect(id.equals(LevelId.of(other))).toBe(false);
      expect(LevelId.of(other).equals(id)).toBe(false);
    }
  });
});
