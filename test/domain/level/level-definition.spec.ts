import { FitSection } from '../../../src/domain/level/fit/fit-section.js';
import { HexTopology } from '../../../src/domain/level/hex-topology.js';
import { LevelDefinition } from '../../../src/domain/level/level-definition.js';
import { LevelOrder } from '../../../src/domain/level/level-order.js';
import { LevelVersion } from '../../../src/domain/level/level-version.js';
import { SortSection } from '../../../src/domain/level/sort/sort-section.js';
import { TopologyId } from '../../../src/domain/level/topology-id.js';
import { GameId } from '../../../src/domain/progress/game-id.js';
import { LevelId } from '../../../src/domain/progress/level-id.js';
import { err, ok } from '../../../src/domain/shared/result.js';
import {
  jsonBlocksOfFormat,
  levelExample,
  levelFrom,
  valueOf,
} from '../../support/level-format.js';

// A level is born valid (#77): LevelDefinition.of() builds a level only from
// a section that its section type accepted.
const FIT = GameId.of('fit');
const FIT_01 = LevelId.of('fit-01');
const FIRST = valueOf(LevelOrder.of(1));
const V1 = valueOf(LevelVersion.of(1));
const HEX = valueOf(TopologyId.of('hex'));

describe('LevelDefinition', () => {
  describe('the shared level format', () => {
    it('should_build_a_level_when_the_fit_example_of_the_format_document_is_read', () => {
      const level = levelFrom(levelExample('fit'), (raw) => FitSection.of(raw, new HexTopology()));

      expect(level.ok).toBe(true);
      expect(valueOf(level).equals(valueOf(levelFrom(levelExample('fit'), () => ok('any'))))).toBe(
        true,
      );
    });

    it('should_build_a_level_when_the_sort_example_of_the_format_document_is_read', () => {
      const level = levelFrom(levelExample('sort'), (raw) => SortSection.of(raw));

      expect(level.ok).toBe(true);
      expect(valueOf(level).equals(valueOf(levelFrom(levelExample('sort'), () => ok('any'))))).toBe(
        true,
      );
    });

    // Every other block of the document is a part of a level, never a second example.
    it('should_hold_one_complete_example_per_variant_when_the_format_document_is_read', () => {
      const complete = jsonBlocksOfFormat().filter(
        (block) => typeof block === 'object' && block !== null && 'gameId' in block,
      );

      expect(complete.map((block) => (block as { gameId: string }).gameId)).toEqual([
        'fit',
        'sort',
      ]);
    });
  });

  it('should_return_the_section_problem_when_the_section_has_the_wrong_shape', () => {
    const wrongShape = { ...levelExample('fit').section, figure: 'not a list' };

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
    const stored = valueOf(LevelDefinition.of(FIT, FIT_01, FIRST, V1, HEX, ok('stored')));
    const newer = valueOf(
      LevelDefinition.of(
        GameId.of('fit'),
        LevelId.of('fit-01'),
        valueOf(LevelOrder.of(2)),
        valueOf(LevelVersion.of(2)),
        valueOf(TopologyId.of('square')),
        ok('newer'),
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
        LevelDefinition.of(FIT, FIT_01, FIRST, valueOf(LevelVersion.of(version)), HEX, ok('copy')),
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

    // The rule compares two copies of one level. Another level is a defect
    // of the caller, not a datum of a level, so this guard throws.
    it('should_throw_when_the_incoming_level_is_another_level', () => {
      const stored = copy(1);
      const otherLevel = valueOf(
        LevelDefinition.of(FIT, LevelId.of('fit-02'), FIRST, V1, HEX, ok('copy')),
      );

      expect(() => stored.accepts(otherLevel)).toThrow(
        'The version rule compares two copies of one level.',
      );
    });
  });

  // The repository saves a level only under its own key (#80).
  it('should_tell_its_identity_when_asked_with_a_game_and_a_level_id', () => {
    const level = valueOf(LevelDefinition.of(FIT, FIT_01, FIRST, V1, HEX, ok('section')));

    expect(level.isIdentifiedBy(GameId.of('fit'), LevelId.of('fit-01'))).toBe(true);
    expect(level.isIdentifiedBy(FIT, LevelId.of('fit-02'))).toBe(false);
    expect(level.isIdentifiedBy(GameId.of('sort'), FIT_01)).toBe(false);
  });

  it('should_be_another_level_when_the_game_or_the_level_id_differs', () => {
    const level = valueOf(LevelDefinition.of(FIT, FIT_01, FIRST, V1, HEX, ok('section')));
    const otherLevel = valueOf(
      LevelDefinition.of(FIT, LevelId.of('fit-02'), FIRST, V1, HEX, ok('section')),
    );
    const otherGame = valueOf(
      LevelDefinition.of(GameId.of('sort'), FIT_01, FIRST, V1, HEX, ok('section')),
    );

    expect(level.equals(otherLevel)).toBe(false);
    expect(level.equals(otherGame)).toBe(false);
  });
});
