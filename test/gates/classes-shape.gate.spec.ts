import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const CLASSES = 'docs/architecture/classes.md';
const DECISIONS_HEADING = '## Decisions to check with the team';

// The limit of one line, in code points. classes.md keeps each paragraph on
// one line. On 2026-11-28 the longest paragraph that holds one idea had 5809
// code points (decision 6), and the two lines that held a whole decision had
// 6370 (decision 2) and 6800 (decision 15). A merge that joins two decisions
// makes a line of about twice the length of one decision. 6000 holds every
// paragraph of one idea and still catches such a join. A lower limit makes
// other decisions fail, and the queue of 2026-11-28 changes those in other
// pull requests (#180, #182, #224).
const LONGEST_LINE = 6000;

// A git conflict marker of the zdiff3 style at the start of a line. Leading
// spaces count, because a marker inside a list item is indented.
const MERGE_MARKER = /^[ \t]*(?:<{7}|\|{7}|={7}|>{7})(?=\s|$)/;

// The text that a tool writes when it cuts its output. Pasted into the
// document, it hides the text that it replaced.
const TRUNCATION = 'characters truncated';

// A decision starts a line of the decisions section: its number, a period, a
// space and a bold title. A continuation paragraph never starts like that, or
// the formatter reads it as a new list item and numbers the list again.
const DECISION_START = /^(\d+)\. \*\*/;

// A decision start after other text on the same line: a merge joined two
// decisions.
const JOINED_DECISION = /\S\s+\d+\. \*\*/;

type NumberedLine = { number: number; text: string };

const numberedLines = (markdown: string): NumberedLine[] =>
  markdown.split('\n').map((text, index) => ({ number: index + 1, text }));

// The lines of the decisions section, up to the next level-2 heading.
const decisionSection = (markdown: string): NumberedLine[] => {
  const lines = numberedLines(markdown);
  const start = lines.findIndex((line) => line.text === DECISIONS_HEADING);
  if (start === -1) {
    return [];
  }
  const end = lines.findIndex((line, index) => index > start && line.text.startsWith('## '));
  return lines.slice(start + 1, end === -1 ? undefined : end);
};

// The number of each decision, in the order of the document.
const decisionNumbers = (markdown: string): number[] =>
  decisionSection(markdown).flatMap((line) => {
    const match = DECISION_START.exec(line.text);
    return match === null ? [] : [Number(match[1])];
  });

// Each break of the sequence 1..n: a number in the wrong place or a repeat.
const numberingFaults = (numbers: number[]): string[] =>
  numbers.flatMap((value, index) => {
    if (numbers.indexOf(value) !== index) {
      return [`decision ${value} repeats`];
    }
    return value === index + 1 ? [] : [`decision ${index + 1} is ${value}`];
  });

// The line numbers where a decision starts after other text.
const joinedDecisions = (markdown: string): number[] =>
  decisionSection(markdown)
    .filter((line) => JOINED_DECISION.test(line.text))
    .map((line) => line.number);

// Each line longer than the limit, with its length in code points.
const longLines = (markdown: string, limit: number): string[] =>
  numberedLines(markdown)
    .map((line) => ({ number: line.number, length: Array.from(line.text).length }))
    .filter((line) => line.length > limit)
    .map((line) => `line ${line.number}: ${line.length}`);

// The line numbers of the git conflict markers.
const mergeMarkers = (markdown: string): number[] =>
  numberedLines(markdown)
    .filter((line) => MERGE_MARKER.test(line.text))
    .map((line) => line.number);

// The line numbers that hold the text of a cut tool output.
const truncations = (markdown: string): number[] =>
  numberedLines(markdown)
    .filter((line) => line.text.includes(TRUNCATION))
    .map((line) => line.number);

// Inline fixture data of the gate, in the style of the changelog gate.
const fixture = (...decisions: string[]): string =>
  ['# Class diagram', '', DECISIONS_HEADING, '', ...decisions, '', '## Render the images', ''].join(
    '\n',
  );

const FIRST = '1. **Ports in the application layer.** The ports belong to layer 2.';
const SECOND = '2. **One progress aggregate.** The domain comes first.';
const THIRD = '3. **The progress row fields.** DS-5 fixes the key.';

const classes = readFileSync(resolve(ROOT, CLASSES), 'utf8');

// #249, rule R-classes-shape: a merge joined decisions of the class document
// of the app into long lines, and the formatter numbered them again
// (hexablock-app#455). This gate reads the shape of classes.md.
describe('classes.md shape', () => {
  it('should_number_the_decisions_from_one_without_a_gap_when_classes_md_is_read', () => {
    const numbers = decisionNumbers(classes);

    expect(numbers.length).toBeGreaterThan(0);
    expect(numberingFaults(numbers)).toEqual([]);
  });

  it('should_report_the_break_when_a_decision_number_is_missing_or_repeats', () => {
    expect(numberingFaults(decisionNumbers(fixture(FIRST, THIRD)))).toEqual(['decision 2 is 3']);
    expect(numberingFaults(decisionNumbers(fixture(FIRST, SECOND, SECOND)))).toEqual([
      'decision 2 repeats',
    ]);
    expect(numberingFaults(decisionNumbers(fixture(FIRST, SECOND, THIRD)))).toEqual([]);
  });

  it('should_find_no_joined_decision_when_classes_md_is_read', () => {
    expect(joinedDecisions(classes)).toEqual([]);
  });

  it('should_report_the_line_when_two_decisions_share_a_line', () => {
    expect(joinedDecisions(fixture(FIRST, `${SECOND} ${THIRD}`))).toEqual([6]);
    expect(joinedDecisions(fixture(FIRST, SECOND, THIRD))).toEqual([]);
  });

  it('should_keep_every_line_within_the_limit_when_classes_md_is_read', () => {
    expect(longLines(classes, LONGEST_LINE)).toEqual([]);
  });

  it('should_report_the_line_when_a_line_passes_the_limit', () => {
    const atLimit = `${'a'.repeat(LONGEST_LINE - 1)}«`;
    const pastLimit = `${atLimit}b`;

    expect(longLines(fixture(FIRST, atLimit, pastLimit), LONGEST_LINE)).toEqual([
      `line 7: ${LONGEST_LINE + 1}`,
    ]);
  });

  it('should_find_no_merge_marker_when_classes_md_is_read', () => {
    expect(mergeMarkers(classes)).toEqual([]);
  });

  it('should_report_each_marker_when_a_merge_conflict_stays_in_the_text', () => {
    const conflict = fixture(
      FIRST,
      '<<<<<<< HEAD',
      SECOND,
      '   ||||||| base',
      '=======',
      THIRD,
      '    >>>>>>> origin/main',
      '======== is no marker, and == is none either.',
    );

    expect(mergeMarkers(conflict)).toEqual([6, 8, 9, 11]);
  });

  it('should_find_no_cut_tool_output_when_classes_md_is_read', () => {
    expect(truncations(classes)).toEqual([]);
  });

  it('should_report_the_line_when_it_holds_characters_truncated', () => {
    const cut = `${SECOND} [12345 ${TRUNCATION}] The domain comes first.`;

    expect(truncations(fixture(FIRST, cut, THIRD))).toEqual([6]);
  });
});
