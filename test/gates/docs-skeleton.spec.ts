import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(resolve(ROOT, path), 'utf8');
const headingsOf = (markdown: string, level: number): string[] =>
  [...markdown.matchAll(new RegExp(`^${'#'.repeat(level)} (.+)$`, 'gm'))].map((match) =>
    match[1].trim(),
  );

// Gate S7: the README sections of the project statement, in English.
const README_SECTIONS = [
  'Project Title & Badges',
  'Description',
  'Architecture',
  'Generic Engine',
  'Design Patterns',
  'SOLID Principles',
  'AOP',
  'Getting Started',
  'Running Tests',
  'AI Usage Documentation',
  'Contributing',
  'License',
];

const AI_USAGE_SECTIONS = ['Tools Used', 'Usage Log per Task', 'Critical Evaluation'];

// Gate S8: each AGENTS.md rule names its gate or says it has none.
const RULE_MARKER = /<!-- rule: (R-[a-z0-9-]+) -->/;

describe('docs skeleton', () => {
  it('should_list_required_sections_when_readme_is_read', () => {
    expect(headingsOf(read('README.md'), 2)).toEqual(README_SECTIONS);
  });

  it('should_list_required_sections_when_ai_usage_is_read', () => {
    expect(headingsOf(read('AI_USAGE.md'), 2)).toEqual(AI_USAGE_SECTIONS);
  });

  it('should_find_docs_index_when_docs_folder_is_read', () => {
    expect(existsSync(resolve(ROOT, 'docs/README.md'))).toBe(true);
  });

  it('should_name_an_existing_gate_when_agents_rule_is_marked', () => {
    const ruleLines = read('AGENTS.md')
      .split('\n')
      .filter((line) => RULE_MARKER.test(line));
    const ids = ruleLines.map((line) => RULE_MARKER.exec(line)?.[1]);

    const gates = ruleLines.map((line) => /Gate: (.+?)\. <!--/.exec(line)?.[1] ?? '');
    const gatePaths = gates.flatMap((gate) =>
      [...gate.matchAll(/`([^`]+)`/g)].map((match) => match[1]),
    );
    const unnamed = gates.filter((gate) => gate !== 'no gate' && !gate.includes('`'));
    const missingPaths = gatePaths.filter((path) => !existsSync(resolve(ROOT, path)));

    expect(ruleLines.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect(unnamed).toEqual([]);
    expect(missingPaths).toEqual([]);
  });
});
