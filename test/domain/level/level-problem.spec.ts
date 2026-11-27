import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { LevelProblem } from '../../../src/domain/level/level-problem.js';
import { LEVEL_FORMAT } from '../../support/level-format.js';

// Decision 11 (#223, option C+): each code of LevelProblem is a client code
// or a part code. A client code reaches a client through PUT /v1/levels. A
// part code names the rule of a value object inside a section. The section
// names its field to the client, so no client sees a part code. The record is
// exhaustive: a new code fails `pnpm typecheck` until somebody classifies it.
const AUDIENCE: Record<LevelProblem, 'client' | 'part'> = {
  'game-without-levels': 'client',
  'invalid-order': 'client',
  'invalid-version': 'client',
  'invalid-topology': 'client',
  'older-version': 'client',
  'unknown-topology': 'client',
  'invalid-coordinate': 'part',
  'invalid-section': 'client',
  'invalid-figure': 'client',
  'invalid-pieces': 'client',
  'invalid-witness': 'client',
  'invalid-stars': 'client',
  'unequal-area': 'client',
  'inexact-witness': 'client',
  'invalid-piece': 'part',
  'invalid-piece-id': 'part',
  'invalid-placement': 'part',
  'invalid-rotation': 'part',
  'invalid-star-threshold': 'part',
  'invalid-radius': 'client',
  'invalid-goals': 'client',
  'invalid-source': 'client',
  'invalid-seed': 'part',
  'invalid-color': 'part',
};

const ROOT = resolve(import.meta.dirname, '../../..');

function isLevelProblem(word: string): word is LevelProblem {
  return Object.hasOwn(AUDIENCE, word);
}

// The client codes, sorted, so a test compares them in any order.
function clientCodes(): string[] {
  return Object.keys(AUDIENCE)
    .filter((code) => isLevelProblem(code) && AUDIENCE[code] === 'client')
    .toSorted();
}

// The section «Level problems» of the level format: the text from its
// heading to the next heading of the same level.
function levelProblemsSection(): string {
  const markdown = readFileSync(resolve(ROOT, LEVEL_FORMAT), 'utf8');
  const start = markdown.indexOf('\n## Level problems\n');
  if (start === -1) {
    return '';
  }
  const end = markdown.indexOf('\n## ', start + 1);
  return markdown.slice(start, end === -1 ? undefined : end);
}

// The first cell of each row of a table, when it is a word in backquotes.
function firstCellsOf(text: string): string[] {
  return [...text.matchAll(/^\| `([^`]+)` /gm)].map(([, word]) => word);
}

// The description of the 400 answer of PUT /v1/levels in the committed
// OpenAPI document. The client generates its API types from that document.
function levelUpdateBadRequest(): string {
  const document = JSON.parse(readFileSync(resolve(ROOT, 'openapi/openapi.json'), 'utf8')) as {
    paths: Record<string, Record<string, { responses: Record<string, { description: string }> }>>;
  };
  return document.paths['/v1/levels'].put.responses['400'].description;
}

// The codes of LevelProblem among the words in backquotes of a text.
function levelProblemsIn(text: string): string[] {
  return [...text.matchAll(/`([^`]+)`/g)].map(([, word]) => word).filter(isLevelProblem);
}

describe('LevelProblem (decision 11, #223)', () => {
  it('should_list_each_client_code_once_and_no_part_code_when_the_level_format_shows_its_table_of_level_problems', () => {
    expect(firstCellsOf(levelProblemsSection()).toSorted()).toEqual(clientCodes());
  });

  it('should_name_each_client_code_once_and_no_part_code_when_the_openapi_document_describes_the_bad_request_of_the_level_update', () => {
    expect(levelProblemsIn(levelUpdateBadRequest()).toSorted()).toEqual(clientCodes());
  });
});
