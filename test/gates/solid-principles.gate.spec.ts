import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const README = readFileSync(resolve(ROOT, 'README.md'), 'utf8');

// API-NFR-06: each principle has one example from this repository.
const PRINCIPLES = [
  'Single responsibility',
  'Open/closed',
  'Liskov substitution',
  'Interface segregation',
  'Dependency inversion',
];

// The text between "## SOLID Principles" and the next level-2 heading.
const section = (): string => {
  const start = README.indexOf('## SOLID Principles');
  const end = README.indexOf('\n## ', start + 1);
  return start === -1 ? '' : README.slice(start, end === -1 ? undefined : end);
};

// Each list item that starts with a bold principle name, with its wrapped lines.
const examples = (): Map<string, string> => {
  const items = section().split(/\n(?=- \*\*)/);
  return new Map(
    items.flatMap((item) => {
      const name = /^- \*\*(.+?):\*\*/.exec(item)?.[1];
      return name === undefined ? [] : [[name, item] as const];
    }),
  );
};

const linkTargets = (markdown: string): string[] =>
  [...markdown.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1].split('#')[0]);

describe('SOLID principles in the README', () => {
  it('should_give_one_source_file_link_per_principle_when_solid_section_is_read', () => {
    const byName = examples();
    const withoutSourceLink = PRINCIPLES.filter(
      (name) => !linkTargets(byName.get(name) ?? '').some((target) => target.startsWith('src/')),
    );

    expect([...byName.keys()]).toEqual(PRINCIPLES);
    expect(withoutSourceLink).toEqual([]);
  });

  it('should_resolve_every_link_to_an_existing_file_when_solid_section_is_read', () => {
    const targets = linkTargets(section());
    const broken = targets.filter(
      (target) => /^[a-z]+:/i.test(target) || !existsSync(resolve(ROOT, target)),
    );

    expect(targets.length).toBeGreaterThan(0);
    expect(broken).toEqual([]);
  });
});
