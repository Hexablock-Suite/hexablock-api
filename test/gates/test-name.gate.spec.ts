import { codesOf, lintFile } from '../support/lint.js';

// Gate S5: test titles follow should_<expected_result>_when_<condition>.
describe('test-name gate', () => {
  it('should_report_valid_title_when_test_name_breaks_convention', () => {
    const codes = codesOf(lintFile('test/fixtures/lint/bad-title.spec.ts'));

    // One report for it() and one for test().
    expect(codes.filter((code) => code.includes('valid-title'))).toHaveLength(2);
  });

  it('should_accept_title_when_test_name_follows_convention', () => {
    const codes = codesOf(lintFile('test/fixtures/lint/good-title.spec.ts'));

    expect(codes).not.toContainEqual(expect.stringContaining('valid-title'));
  });
});
