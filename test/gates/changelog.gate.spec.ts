import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const CHANGELOG = resolve(ROOT, 'CHANGELOG.md');
const UNRELEASED = '## [Unreleased]';
const VERSION_HEADING = /^## \[\d+\.\d+\.\d+\] - \d{4}-\d{2}-\d{2}$/;

// Returns the level-2 headings that are neither Unreleased nor a dated version.
const badHeadings = (markdown: string): string[] =>
  markdown
    .split('\n')
    .filter((line) => line.startsWith('## '))
    .filter((line) => line !== UNRELEASED && !VERSION_HEADING.test(line));

// An absent file reads as empty text. The existence test reports it.
const changelog = existsSync(CHANGELOG) ? readFileSync(CHANGELOG, 'utf8') : '';

// Gate of rule R-sprint-release: the Keep a Changelog headings.
describe('changelog', () => {
  it('should_find_the_changelog_when_repo_root_is_read', () => {
    expect(existsSync(CHANGELOG)).toBe(true);
  });

  it('should_hold_an_unreleased_section_when_changelog_is_read', () => {
    expect(changelog.split('\n')).toContain(UNRELEASED);
  });

  it('should_list_no_bad_heading_when_every_version_has_number_and_date', () => {
    expect(badHeadings(changelog)).toEqual([]);
  });

  it('should_report_the_heading_when_a_version_has_no_date', () => {
    const wrong = `${UNRELEASED}\n\n## [0.1.0]\n\n## [0.2.0] - 2026-11-15\n`;

    expect(badHeadings(wrong)).toEqual(['## [0.1.0]']);
  });
});
