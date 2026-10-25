import { codesOf, lintFile } from '../support/lint.js';

// Gate S6: the domain and the application never read the system clock or
// an unseeded random source. They take a Clock or a seeded source instead.
describe('determinism gate', () => {
  it('should_report_each_ambient_read_when_domain_calls_clock_or_random', () => {
    const codes = codesOf(lintFile('test/fixtures/arch/src/domain/reads-ambient-state.ts'));

    // Math.random and Date.now.
    expect(codes.filter((code) => code.includes('no-restricted-properties'))).toHaveLength(2);
    // new Date() and Date().
    expect(codes.filter((code) => code.includes('no-current-date'))).toHaveLength(2);
  });

  it('should_report_clock_read_when_application_calls_new_date', () => {
    const codes = codesOf(lintFile('test/fixtures/arch/src/application/reads-ambient-state.ts'));

    expect(codes).toContainEqual(expect.stringContaining('no-current-date'));
  });

  it('should_accept_date_when_domain_passes_an_explicit_value', () => {
    const codes = codesOf(lintFile('test/fixtures/arch/src/domain/pure.ts'));

    expect(codes).toEqual([]);
  });
});
