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

// Returns the version headings whose date is not a real calendar day.
const impossibleDates = (markdown: string): string[] =>
  markdown
    .split('\n')
    .filter((line) => VERSION_HEADING.test(line))
    .filter((line) => {
      const date = line.slice(-'YYYY-MM-DD'.length);
      const day = new Date(`${date}T00:00:00.000Z`);
      return Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== date;
    });

// Returns each version number that more than one level-2 heading names.
const repeatedVersions = (markdown: string): string[] => {
  const versions = [...markdown.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map((match) => match[1]);
  return [...new Set(versions.filter((version, index) => versions.indexOf(version) !== index))];
};

// The entry lines of one version section, up to the next level-2 heading.
const entriesOf = (markdown: string, version: string): string[] => {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
  if (start === -1) {
    return [];
  }
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .filter((line) => line.startsWith('- '));
};

// The issue and pull request numbers that the entries link, sorted.
const linkedNumbers = (entries: string[]): number[] =>
  [
    ...new Set(
      entries.flatMap((entry) =>
        [...entry.matchAll(/hexablock-api\/(?:issues|pull)\/(\d+)/g)].map((match) =>
          Number(match[1]),
        ),
      ),
    ),
  ].sort((left, right) => left - right);

// The versions that have a tag: v0.0.0, and v0.1.0 of the Sprint 1 release
// (#43, Done when of hexablock-app#76: "[0.1.0] exists in CHANGELOG.md").
const RELEASED_VERSIONS = ['0.0.0', '0.1.0'];

// #43 moved all 11 [Unreleased] entries into [0.1.0]: the #27 design work,
// the Sprint 0 close, #29, #30 and #31. A released section never changes, so
// an entry that a later merge puts there breaks this list.
const RELEASE_0_1_0 = { entries: 11, linked: [27, 29, 30, 31] };

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

  it('should_hold_a_dated_section_when_a_version_is_released', () => {
    const headings = changelog.split('\n').filter((line) => VERSION_HEADING.test(line));
    const missing = RELEASED_VERSIONS.filter(
      (version) => !headings.some((line) => line.startsWith(`## [${version}] - `)),
    );

    expect(missing).toEqual([]);
  });

  it('should_list_only_its_own_entries_when_the_0_1_0_section_is_read', () => {
    const entries = entriesOf(changelog, '0.1.0');

    expect(entries).toHaveLength(RELEASE_0_1_0.entries);
    expect(linkedNumbers(entries)).toEqual(RELEASE_0_1_0.linked);
  });

  it('should_list_no_impossible_date_when_every_version_is_dated', () => {
    expect(impossibleDates(changelog)).toEqual([]);
  });

  it('should_report_the_heading_when_a_version_date_does_not_exist', () => {
    const wrong = `${UNRELEASED}\n\n## [0.2.0] - 2026-02-30\n\n## [0.1.0] - 2026-13-01\n\n## [0.0.0] - 2026-11-01\n`;

    expect(impossibleDates(wrong)).toEqual(['## [0.2.0] - 2026-02-30', '## [0.1.0] - 2026-13-01']);
  });

  it('should_list_no_repeated_version_when_changelog_is_read', () => {
    expect(repeatedVersions(changelog)).toEqual([]);
  });

  it('should_report_the_version_when_two_sections_share_a_number', () => {
    const wrong = `${UNRELEASED}\n\n## [0.1.0] - 2026-11-15\n\n## [0.1.0] - 2026-11-06\n\n## [0.0.0] - 2026-11-01\n`;

    expect(repeatedVersions(wrong)).toEqual(['0.1.0']);
  });
});
