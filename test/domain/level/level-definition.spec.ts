import { FitSection } from '../../../src/domain/level/fit/fit-section.js';
import { HexTopology } from '../../../src/domain/level/hex-topology.js';
import { LevelDefinition, type StoredLevel } from '../../../src/domain/level/level-definition.js';
import { LevelOrder } from '../../../src/domain/level/level-order.js';
import { LevelVersion } from '../../../src/domain/level/level-version.js';
import { SortSection } from '../../../src/domain/level/sort/sort-section.js';
import { TopologyId } from '../../../src/domain/level/topology-id.js';
import { GameId } from '../../../src/domain/shared/game-id.js';
import { LevelId } from '../../../src/domain/shared/level-id.js';
import { Stars } from '../../../src/domain/shared/stars.js';
import { err, ok } from '../../../src/domain/shared/result.js';
import {
  jsonBlocksOfFormat,
  levelExample,
  levelFrom,
  testSection,
  valueOf,
} from '../../support/level-format.js';
import { levelResultOf } from '../../support/level-results.js';

// A level is born valid (#77): LevelDefinition.of() builds a level only from
// a section that its section type accepted.
const FIT = valueOf(GameId.of('hexa-fit'));
const FIT_01 = valueOf(LevelId.of('fit-01'));
const FIRST = valueOf(LevelOrder.of(1));
const V1 = valueOf(LevelVersion.of(1));
const HEX = valueOf(TopologyId.of('hex'));

describe('LevelDefinition', () => {
  describe('the shared level format', () => {
    it('should_build_a_level_when_the_fit_example_of_the_format_document_is_read', () => {
      const level = levelFrom(levelExample('hexa-fit'), (raw) =>
        FitSection.of(raw, new HexTopology()),
      );

      expect(level.ok).toBe(true);
      expect(
        valueOf(level).equals(
          valueOf(levelFrom(levelExample('hexa-fit'), () => ok(testSection('any')))),
        ),
      ).toBe(true);
    });

    it('should_build_a_level_when_the_sort_example_of_the_format_document_is_read', () => {
      const level = levelFrom(levelExample('hexa-sort'), (raw) => SortSection.of(raw));

      expect(level.ok).toBe(true);
      expect(
        valueOf(level).equals(
          valueOf(levelFrom(levelExample('hexa-sort'), () => ok(testSection('any')))),
        ),
      ).toBe(true);
    });

    // Every other block of the document is a part of a level, never a second example.
    it('should_hold_one_complete_example_per_variant_when_the_format_document_is_read', () => {
      const complete = jsonBlocksOfFormat().filter(
        (block) => typeof block === 'object' && block !== null && 'gameId' in block,
      );

      expect(complete.map((block) => (block as { gameId: string }).gameId)).toEqual([
        'hexa-fit',
        'hexa-sort',
      ]);
    });
  });

  it('should_return_the_section_problem_when_the_section_has_the_wrong_shape', () => {
    const wrongShape = { ...levelExample('hexa-fit').section, figure: 'not a list' };

    expect(
      LevelDefinition.of(FIT, FIT_01, FIRST, V1, HEX, FitSection.of(wrongShape, new HexTopology())),
    ).toEqual({
      ok: false,
      error: 'invalid-figure',
    });
    expect(LevelDefinition.of(FIT, FIT_01, FIRST, V1, HEX, err('invalid-section'))).toEqual({
      ok: false,
      error: 'invalid-section',
    });
  });

  // The identity of the root is the gameId plus the levelId (DS-6, DS-11).
  it('should_be_the_same_level_when_the_game_and_the_level_id_are_equal', () => {
    const stored = valueOf(
      LevelDefinition.of(FIT, FIT_01, FIRST, V1, HEX, ok(testSection('stored'))),
    );
    const newer = valueOf(
      LevelDefinition.of(
        valueOf(GameId.of('hexa-fit')),
        valueOf(LevelId.of('fit-01')),
        valueOf(LevelOrder.of(2)),
        valueOf(LevelVersion.of(2)),
        valueOf(TopologyId.of('square')),
        ok(testSection('newer')),
      ),
    );

    expect(stored.equals(newer)).toBe(true);
    expect(newer.equals(stored)).toBe(true);
  });

  // S3-10: the stored copy accepts a copy of the same level with an equal or
  // a higher version, and it rejects a lower version. The rule lives in the
  // root, and LevelRepository.update() runs it again under its lock (#80).
  describe('the version rule of S3-10', () => {
    const copy = (version: number) =>
      valueOf(
        LevelDefinition.of(
          FIT,
          FIT_01,
          FIRST,
          valueOf(LevelVersion.of(version)),
          HEX,
          ok(testSection('copy')),
        ),
      );

    it('should_reject_the_incoming_copy_with_older_version_when_its_version_is_lower', () => {
      const stored = copy(2);

      expect(stored.accepts(copy(1))).toEqual({ ok: false, error: 'older-version' });
    });

    it('should_accept_the_incoming_copy_when_its_version_is_equal_or_higher', () => {
      const stored = copy(2);
      const equal = copy(2);
      const higher = copy(3);

      const acceptedEqual = stored.accepts(equal);
      const acceptedHigher = stored.accepts(higher);

      expect(acceptedEqual.ok && acceptedEqual.value).toBe(equal);
      expect(acceptedHigher.ok && acceptedHigher.value).toBe(higher);
    });

    // #147: a stored row that breaks a rule gives only its version. The
    // incoming copy tells if it is older than that version.
    it('should_be_older_only_when_its_version_is_lower_than_the_stored_version', () => {
      const version = (value: number) => valueOf(LevelVersion.of(value));

      expect(copy(1).isOlderThan(version(2))).toBe(true);
      expect(copy(2).isOlderThan(version(2))).toBe(false);
      expect(copy(3).isOlderThan(version(2))).toBe(false);
    });

    // The rule compares two copies of one level. Another level is a defect
    // of the caller, not a datum of a level, so this guard throws.
    it('should_throw_when_the_incoming_level_is_another_level', () => {
      const stored = copy(1);
      const otherLevel = valueOf(
        LevelDefinition.of(
          FIT,
          valueOf(LevelId.of('fit-02')),
          FIRST,
          V1,
          HEX,
          ok(testSection('copy')),
        ),
      );

      expect(() => stored.accepts(otherLevel)).toThrow(
        'The version rule compares two copies of one level.',
      );
    });

    // #174: the incoming copy decides the version rule over each state of
    // the store, so the use case only coordinates.
    const broken = (version: number | null): StoredLevel => ({
      state: 'broken',
      reason: 'invalid-section',
      version: version === null ? null : valueOf(LevelVersion.of(version)),
    });

    it('should_give_the_incoming_copy_when_no_row_is_stored', () => {
      const incoming = copy(1);

      expect(incoming.decideReplace({ state: 'absent' })).toEqual({ ok: true, value: incoming });
    });

    it.each([1, 2])(
      'should_give_the_incoming_copy_when_the_valid_stored_level_has_a_lower_or_an_equal_version',
      (storedVersion) => {
        const incoming = copy(2);

        expect(incoming.decideReplace({ state: 'valid', level: copy(storedVersion) })).toEqual({
          ok: true,
          value: incoming,
        });
      },
    );

    it('should_reject_the_incoming_copy_with_older_version_when_the_valid_stored_level_has_a_higher_version', () => {
      expect(copy(2).decideReplace({ state: 'valid', level: copy(3) })).toEqual({
        ok: false,
        error: 'older-version',
      });
    });

    it('should_reject_the_incoming_copy_with_older_version_when_the_broken_row_holds_a_newer_version', () => {
      expect(copy(2).decideReplace(broken(3))).toEqual({ ok: false, error: 'older-version' });
    });

    it.each([1, 2])(
      'should_give_the_incoming_copy_when_the_broken_row_holds_a_lower_or_an_equal_version',
      (storedVersion) => {
        const incoming = copy(2);

        expect(incoming.decideReplace(broken(storedVersion))).toEqual({
          ok: true,
          value: incoming,
        });
      },
    );

    it('should_give_the_incoming_copy_when_the_broken_row_holds_no_valid_version', () => {
      const incoming = copy(2);

      expect(incoming.decideReplace(broken(null))).toEqual({ ok: true, value: incoming });
    });
  });

  // The repository saves a level only under its own key (#80).
  it('should_tell_its_identity_when_asked_with_a_game_and_a_level_id', () => {
    const level = valueOf(
      LevelDefinition.of(FIT, FIT_01, FIRST, V1, HEX, ok(testSection('section'))),
    );

    expect(
      level.isIdentifiedBy(valueOf(GameId.of('hexa-fit')), valueOf(LevelId.of('fit-01'))),
    ).toBe(true);
    expect(level.isIdentifiedBy(FIT, valueOf(LevelId.of('fit-02')))).toBe(false);
    expect(level.isIdentifiedBy(valueOf(GameId.of('hexa-sort')), FIT_01)).toBe(false);
  });

  it('should_be_another_level_when_the_game_or_the_level_id_differs', () => {
    const level = valueOf(
      LevelDefinition.of(FIT, FIT_01, FIRST, V1, HEX, ok(testSection('section'))),
    );
    const otherLevel = valueOf(
      LevelDefinition.of(
        FIT,
        valueOf(LevelId.of('fit-02')),
        FIRST,
        V1,
        HEX,
        ok(testSection('section')),
      ),
    );
    const otherGame = valueOf(
      LevelDefinition.of(
        valueOf(GameId.of('hexa-sort')),
        FIT_01,
        FIRST,
        V1,
        HEX,
        ok(testSection('section')),
      ),
    );

    expect(level.equals(otherLevel)).toBe(false);
    expect(level.equals(otherGame)).toBe(false);
  });
});

// DS-6, decided on #134: the most stars that a result can carry is the
// number of star thresholds of its level (#135).
describe('LevelDefinition and the stars of a play', () => {
  const fitLevel = () =>
    valueOf(levelFrom(levelExample('hexa-fit'), (raw) => FitSection.of(raw, new HexTopology())));
  const sortLevel = () =>
    valueOf(levelFrom(levelExample('hexa-sort'), (raw) => SortSection.of(raw)));
  const play = (levelId: string, stars: number) =>
    levelResultOf({ levelId, stars, moves: 12, elapsedMs: 45000 });

  it.each([0, 1, 3])(
    'should_admit_the_result_when_its_stars_are_at_most_the_count_of_star_thresholds',
    (stars) => {
      expect(fitLevel().admits(play('fit-01', stars))).toBe(true);
      expect(sortLevel().admits(play('sort-01', stars))).toBe(true);
    },
  );

  it.each([4, 9])(
    'should_not_admit_the_result_when_its_stars_exceed_the_count_of_star_thresholds',
    (stars) => {
      expect(fitLevel().admits(play('fit-01', stars))).toBe(false);
      expect(sortLevel().admits(play('sort-01', stars))).toBe(false);
    },
  );

  it('should_give_the_count_of_star_thresholds_when_asked_the_most_stars', () => {
    const one = valueOf(LevelDefinition.of(FIT, FIT_01, FIRST, V1, HEX, ok(testSection('one', 1))));

    expect(
      fitLevel()
        .mostStars()
        .equals(valueOf(Stars.of(3))),
    ).toBe(true);
    expect(one.mostStars().equals(valueOf(Stars.of(1)))).toBe(true);
  });

  it('should_tell_the_level_of_a_result_when_the_game_and_the_level_id_match', () => {
    const level = fitLevel();

    expect(level.isLevelOf(FIT, play('fit-01', 3))).toBe(true);
    expect(level.isLevelOf(FIT, play('fit-02', 3))).toBe(false);
    expect(level.isLevelOf(valueOf(GameId.of('hexa-sort')), play('fit-01', 3))).toBe(false);
  });
});
