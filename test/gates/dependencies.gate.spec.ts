import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const PACKAGE_JSON = resolve(ROOT, 'package.json');
const DOC = resolve(ROOT, 'docs/DEPENDENCIES.md');

// The maps of package.json whose entries the document explains.
type DependencyMap = Record<string, string>;

// A markdown list-item line explains one package: `- \`<name>\` — <reason>`.
// Only lines of that shape count, and the reason after the name must be
// non-empty, so a bare `- \`name\`` explains nothing.
const explainedNames = (doc: string): string[] =>
  [...doc.matchAll(/^- `([^`]+)`(.+)$/gm)]
    .map((match) => ({ name: match[1], reason: match[2].trim() }))
    .filter((entry) => entry.reason.length > 0)
    .map((entry) => entry.name);

// The names of the map that the document does not explain. An absent
// document explains nothing, so every name is reported.
const unexplained = (dependencies: DependencyMap, doc: string | null): string[] => {
  const explained = new Set(doc === null ? [] : explainedNames(doc));
  return Object.keys(dependencies).filter((name) => !explained.has(name));
};

// Inline fixture data of the gate, in the style of the changelog gate.
const FIXTURE_DEPENDENCIES: DependencyMap = {
  '@nestjs/common': '^12.0.1',
  'drizzle-orm': '^0.45.4',
  pg: '^8.23.1',
};

const FIXTURE_DOC = [
  '# Dependencies',
  '',
  '## Dependencies',
  '',
  '- `@nestjs/common` — framework decorators and guards of the HTTP layer.',
  '- `drizzle-orm` — the ORM of the persistence adapters.',
  '- `pg` — the production PostgreSQL driver.',
  '',
].join('\n');

const FIXTURE_DOC_MISSING_ONE = FIXTURE_DOC.replace(
  '- `pg` — the production PostgreSQL driver.\n',
  '',
);
const FIXTURE_DOC_BARE_ENTRY = [
  '# Dependencies',
  '',
  '## Dependencies',
  '',
  '- `@nestjs/common` — framework decorators and guards of the HTTP layer.',
  '- `drizzle-orm`',
  '- `pg` — the production PostgreSQL driver.',
  '',
].join('\n');

// The real repo data. The document may be absent while the gate grows.
const packageJson: { dependencies: DependencyMap; devDependencies: DependencyMap } = JSON.parse(
  readFileSync(PACKAGE_JSON, 'utf8'),
);
const doc = existsSync(DOC) ? readFileSync(DOC, 'utf8') : null;

// Gate of rule R-dependencies-doc: every package.json entry has its reason.
describe('dependencies gate', () => {
  it('should_report_no_package_when_the_document_explains_every_dependency', () => {
    expect(unexplained(packageJson.dependencies, doc)).toEqual([]);
    expect(unexplained(packageJson.devDependencies, doc)).toEqual([]);
  });

  it('should_report_no_package_when_every_fixture_dependency_has_a_reason', () => {
    expect(unexplained(FIXTURE_DEPENDENCIES, FIXTURE_DOC)).toEqual([]);
  });

  it('should_report_the_package_when_the_document_misses_its_entry', () => {
    expect(unexplained(FIXTURE_DEPENDENCIES, FIXTURE_DOC_MISSING_ONE)).toEqual(['pg']);
  });

  it('should_report_the_package_when_its_line_has_no_reason', () => {
    expect(unexplained(FIXTURE_DEPENDENCIES, FIXTURE_DOC_BARE_ENTRY)).toEqual(['drizzle-orm']);
  });

  it('should_report_every_package_when_the_document_is_absent', () => {
    expect(unexplained({ 'drizzle-orm': '^0.45.4' }, null)).toEqual(['drizzle-orm']);
  });
});
