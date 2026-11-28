import { BoardRadius } from '../../../src/domain/level/sort/board-radius.js';
import { GoalCount } from '../../../src/domain/level/sort/goal-count.js';
import { Seed } from '../../../src/domain/level/sort/seed.js';
import { SortSection } from '../../../src/domain/level/sort/sort-section.js';
import { StackSource } from '../../../src/domain/level/sort/stack-source.js';
import { TileColor } from '../../../src/domain/level/sort/tile-color.js';
import { levelExample, valueOf } from '../../support/level-format.js';

// The rules of the Sort section and of its parts enter through
// LevelValidators.check(), in level-validators-check.spec.ts (#255): the
// shape of each field, the rules of each part and the delivery. Only the
// equals() cases stay here. No code of src/ compares two sections, two
// sources, two radii, two goals, two seeds or two colors, so no case
// through the service or the root can reach them. The fixtures come from
// the Sort example of the format document.
function sortSection(): Record<string, unknown> {
  return levelExample('hexa-sort').section;
}

const FIXED_SOURCE = { stacks: [['red', 'red', 'blue'], ['green'], ['blue', 'green']] };

describe('SortSection', () => {
  it('should_be_equal_when_two_sections_are_read_from_the_same_data', () => {
    expect(
      valueOf(SortSection.of(sortSection())).equals(valueOf(SortSection.of(sortSection()))),
    ).toBe(true);
  });

  // The section keeps every field it reads: a change to one value of one
  // field gives another section. Each list keeps its length.
  it('should_differ_when_one_value_of_the_raw_section_differs', () => {
    const example = valueOf(SortSection.of(sortSection()));
    const section = sortSection();
    const stars = section.stars as Record<string, unknown>[];
    const changed = [
      { ...section, radius: (section.radius as number) + 1 },
      { ...section, goals: (section.goals as number) + 1 },
      { ...section, source: FIXED_SOURCE },
      { ...section, stars: [{ maxMoves: 41 }, ...stars.slice(1)] },
    ];

    expect(changed.map((raw) => example.equals(valueOf(SortSection.of(raw))))).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });
});

describe('BoardRadius', () => {
  it('should_be_equal_when_two_radii_hold_the_same_number', () => {
    expect(valueOf(BoardRadius.of(2)).equals(valueOf(BoardRadius.of(2)))).toBe(true);
    expect(valueOf(BoardRadius.of(2)).equals(valueOf(BoardRadius.of(3)))).toBe(false);
  });
});

describe('GoalCount', () => {
  it('should_be_equal_when_two_goals_hold_the_same_count', () => {
    expect(valueOf(GoalCount.of(3)).equals(valueOf(GoalCount.of(3)))).toBe(true);
    expect(valueOf(GoalCount.of(3)).equals(valueOf(GoalCount.of(4)))).toBe(false);
  });
});

describe('Seed', () => {
  it('should_be_equal_when_two_seeds_hold_the_same_number', () => {
    expect(valueOf(Seed.of(7)).equals(valueOf(Seed.of(7)))).toBe(true);
    expect(valueOf(Seed.of(7)).equals(valueOf(Seed.of(8)))).toBe(false);
  });
});

describe('TileColor', () => {
  // The names compare as written, as the app compares its colors.
  it('should_be_equal_when_two_colors_hold_the_same_name', () => {
    expect(valueOf(TileColor.of('red')).equals(valueOf(TileColor.of('red')))).toBe(true);
    expect(valueOf(TileColor.of('red')).equals(valueOf(TileColor.of('Red')))).toBe(false);
  });
});

describe('StackSource', () => {
  const seeded = { seed: 7, colors: ['red', 'green'] };

  // The order counts: a draw picks a color by its place, and a fixed source
  // gives its stacks in order, each stack from the bottom tile up.
  it('should_be_equal_when_two_sources_hold_the_same_kind_and_the_same_data_in_order', () => {
    const source = valueOf(StackSource.of(seeded));
    const fixed = valueOf(StackSource.of(FIXED_SOURCE));

    expect([
      source.equals(valueOf(StackSource.of({ seed: 7, colors: ['red', 'green'] }))),
      source.equals(valueOf(StackSource.of({ seed: 8, colors: ['red', 'green'] }))),
      source.equals(valueOf(StackSource.of({ seed: 7, colors: ['green', 'red'] }))),
      source.equals(fixed),
      fixed.equals(source),
      fixed.equals(
        valueOf(StackSource.of({ stacks: [['red', 'red', 'blue'], ['green'], ['blue', 'green']] })),
      ),
      fixed.equals(
        valueOf(StackSource.of({ stacks: [['blue', 'red', 'red'], ['green'], ['blue', 'green']] })),
      ),
    ]).toEqual([true, false, false, false, false, true, false]);
  });
});
