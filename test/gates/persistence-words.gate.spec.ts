import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { typeScriptFilesIn } from './domain-surface.js';

const ROOT = resolve(import.meta.dirname, '../..');

// Gate of #177: the comments of src/domain state the domain rule in domain
// words. They name no part of the store. The list holds only words with no
// other meaning in the domain. A plain «row» stays out of the list, because
// a grid and a leaderboard have rows too. Only a stored row and a broken
// row name the store. The gate reads comments only, never code.
const PERSISTENCE_WORDS =
  /\b(?:columns?|tables?|postgres(?:ql)?|sql|drizzle|row\s+mappers?|persistence\s+adapters?|lock\s+of|stored\s+rows?|broken\s+rows?)\b/gi;

// The NUL character stands for each code character, so a phrase never
// joins two comments across code.
const CODE = '\u0000';

// Gives the comments of a source text: line comments, block comments and
// JSDoc. Each position of the result holds the same character as the
// source, a space for a comment marker, or CODE for a code character. So
// the line of a match is the line of the source, and a phrase of two
// words can cross the end of a line.
function commentTextOf(source: string): string {
  const file = ts.createSourceFile('source.ts', source, ts.ScriptTarget.Latest, true);
  const ranges = new Map<number, ts.CommentRange>();
  const visit = (node: ts.Node): void => {
    for (const range of ts.getLeadingCommentRanges(source, node.getFullStart()) ?? []) {
      ranges.set(range.pos, range);
    }
    for (const range of ts.getTrailingCommentRanges(source, node.getEnd()) ?? []) {
      ranges.set(range.pos, range);
    }
    for (const child of node.getChildren(file)) {
      visit(child);
    }
  };
  visit(file);
  const code = (from: number, to: number): string => source.slice(from, to).replace(/\S/g, CODE);
  let text = '';
  let at = 0;
  for (const { pos, end } of [...ranges.values()].sort((a, b) => a.pos - b.pos)) {
    const comment = source
      .slice(pos, end)
      .replace(/^\/\/|^\/\*|\*\/$/g, (marker) => ' '.repeat(marker.length))
      .replace(/^(\s*)\*/gm, '$1 ');
    text += code(at, pos) + comment;
    at = end;
  }
  return text + code(at, source.length);
}

// Gives one entry per persistence word in the comments of a source text, as
// "<line>: <word>". The words of a phrase come with one space.
export function persistenceWordsIn(source: string): string[] {
  const text = commentTextOf(source);
  return [...text.matchAll(PERSISTENCE_WORDS)].map((match) => {
    const line = text.slice(0, match.index).split('\n').length;
    return `${line}: ${match[0].replace(/\s+/g, ' ')}`;
  });
}

describe('persistence words gate', () => {
  it('should_find_no_persistence_word_when_the_comments_of_src_domain_are_read', () => {
    const found = typeScriptFilesIn('src/domain').flatMap((path) =>
      persistenceWordsIn(readFileSync(resolve(ROOT, path), 'utf8')).map(
        (entry) => `${path}:${entry}`,
      ),
    );

    expect(found).toEqual([]);
  });

  it('should_report_each_word_when_a_line_a_block_or_a_jsdoc_comment_names_the_store', () => {
    const source = [
      '// The Postgres column keeps the value.',
      '/* The SQL of the levels table. */',
      '/**',
      ' * Read under the lock of update(), with Drizzle.',
      ' */',
      'const value = 1; // A stored row and a broken ROW.',
      '// The row',
      '// mapper and the persistence adapter.',
    ].join('\n');

    expect(persistenceWordsIn(source)).toEqual([
      '1: Postgres',
      '1: column',
      '2: SQL',
      '2: table',
      '4: lock of',
      '4: Drizzle',
      '6: stored row',
      '6: broken ROW',
      '7: row mapper',
      '8: persistence adapter',
    ]);
  });

  it('should_accept_the_words_when_only_code_holds_them', () => {
    const source = [
      "const table = 'sql column';",
      'interface Row<T> { readonly row: T }',
      'const rows = [1].map((row) => row); // Each value of the list.',
    ].join('\n');

    expect(persistenceWordsIn(source)).toEqual([]);
  });

  it('should_accept_a_row_when_a_comment_names_the_row_of_a_grid_or_a_board', () => {
    const source = [
      '// A cell is [col, row]. One rotation step turns [col, row] to [-row, col].',
      '// The rank is 1 plus the number of rows of the board that are better.',
      '// The stored copy of a level, and a stored level that breaks a rule.',
    ].join('\n');

    expect(persistenceWordsIn(source)).toEqual([]);
  });

  it('should_accept_a_phrase_when_code_stands_between_its_two_words', () => {
    const source = ['// The row', 'const mapper = 1; // mapper'].join('\n');

    expect(persistenceWordsIn(source)).toEqual([]);
  });
});
