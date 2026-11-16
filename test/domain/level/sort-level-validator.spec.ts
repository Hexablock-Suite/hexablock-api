import { LevelOrder } from '../../../src/domain/level/level-order.js';
import { LevelValidators } from '../../../src/domain/level/level-validators.js';
import { LevelVersion } from '../../../src/domain/level/level-version.js';
import { SortLevelValidator } from '../../../src/domain/level/sort/sort-level-validator.js';
import { SortSection } from '../../../src/domain/level/sort/sort-section.js';
import { TopologyId } from '../../../src/domain/level/topology-id.js';
import { GameId } from '../../../src/domain/progress/game-id.js';
import { LevelId } from '../../../src/domain/progress/level-id.js';
import { levelExample, levelFrom, valueOf, type LevelJson } from '../../support/level-format.js';

// The Sort strategy of DS-6 (#78). It only picks SortSection and asks it to
// read the raw section, so SortSection decides every rule. The fixtures come
// from the Sort example of the format document.
const HEX = valueOf(TopologyId.of('hex'));

// Builds a level of the format document as the border does, with the Sort strategy.
function sortLevelFrom(json: LevelJson) {
  const topology = valueOf(TopologyId.of(json.topology));
  return levelFrom(json, (raw) => new SortLevelValidator().sectionOf(raw, topology));
}

describe('SortLevelValidator', () => {
  // The composition root registers the strategy under the Sort gameId.
  it('should_build_the_sort_level_when_the_sort_example_of_the_format_document_is_checked', () => {
    const example = levelExample('hexa-sort');
    const validators = LevelValidators.of([
      [valueOf(GameId.of('hexa-sort')), new SortLevelValidator()],
    ]);

    const section = new SortLevelValidator().sectionOf(example.section, HEX);
    const checked = validators.check(
      valueOf(GameId.of(example.gameId)),
      valueOf(LevelId.of(example.levelId)),
      valueOf(LevelOrder.of(example.order)),
      valueOf(LevelVersion.of(example.version)),
      valueOf(TopologyId.of(example.topology)),
      example.section,
    );

    expect(valueOf(section).equals(valueOf(SortSection.of(example.section)))).toBe(true);
    expect(sortLevelFrom(example).ok).toBe(true);
    expect(checked.ok).toBe(true);
  });

  // SortSection checks its own shape, and the strategy gives its problem
  // unchanged. No level exists for a rejected section.
  it('should_return_the_problem_of_the_section_when_the_sort_section_has_the_wrong_shape', () => {
    const example = levelExample('hexa-sort');
    const section = example.section;
    const { goals, source, stars } = section;
    const wrong: unknown[] = [
      null,
      [],
      'section',
      { ...section, extra: true },
      levelExample('hexa-fit').section,
      { goals, source, stars },
      { ...section, radius: 0 },
      { ...section, goals: '3' },
      { ...section, source: { seed: 1, colors: [] } },
      { ...section, stars: [] },
      { ...section, stars: [{ maxMoves: 30, maxElapsedMs: 1000 }] },
    ];

    expect(wrong.map((raw) => new SortLevelValidator().sectionOf(raw, HEX))).toEqual([
      { ok: false, error: 'invalid-section' },
      { ok: false, error: 'invalid-section' },
      { ok: false, error: 'invalid-section' },
      { ok: false, error: 'invalid-section' },
      { ok: false, error: 'invalid-section' },
      { ok: false, error: 'invalid-radius' },
      { ok: false, error: 'invalid-radius' },
      { ok: false, error: 'invalid-goals' },
      { ok: false, error: 'invalid-source' },
      { ok: false, error: 'invalid-stars' },
      { ok: false, error: 'invalid-stars' },
    ]);
    expect(sortLevelFrom({ ...example, section: { ...section, extra: true } })).toEqual({
      ok: false,
      error: 'invalid-section',
    });
  });

  // Moves.of() returns a failed Result for a negative limit (#103), and the
  // section turns it into its level problem. A bad level file never gives a
  // server error. No level exists for the rejected section.
  it.each([{ stars: [{ maxMoves: -1 }] }, { stars: [{ maxMoves: 40 }, { maxMoves: -5 }] }])(
    'should_return_invalid_stars_without_a_throw_when_a_star_threshold_is_negative',
    ({ stars }) => {
      const example = levelExample('hexa-sort');
      const read = () => new SortLevelValidator().sectionOf({ ...example.section, stars }, HEX);

      expect(read).not.toThrow();
      expect(read()).toEqual({ ok: false, error: 'invalid-stars' });
      expect(sortLevelFrom({ ...example, section: { ...example.section, stars } })).toEqual({
        ok: false,
        error: 'invalid-stars',
      });
    },
  );

  // No rule of the Sort section needs the topology (decision 6). The API
  // never rejects a level only because its topology is not hex.
  it('should_build_an_equal_section_when_the_topology_of_the_level_is_not_hex', () => {
    const example = levelExample('hexa-sort');
    const square = valueOf(TopologyId.of('square'));

    const onHex = valueOf(new SortLevelValidator().sectionOf(example.section, HEX));
    const onSquare = valueOf(new SortLevelValidator().sectionOf(example.section, square));

    expect(onSquare.equals(onHex)).toBe(true);
    expect(sortLevelFrom({ ...example, topology: 'square' }).ok).toBe(true);
  });
});
