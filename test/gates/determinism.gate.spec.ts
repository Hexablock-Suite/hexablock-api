import { Test } from '@nestjs/testing';
import { CLOCK } from '../../src/application/ports/clock.js';
import { AppModule } from '../../src/infrastructure/app.module.js';
import { SystemClock } from '../../src/infrastructure/clock/system-clock.js';
import { codesOf, lintFile } from '../support/lint.js';

// Gate S6: the domain and the application never read the system clock or
// an unseeded random source. The application reads the instant from the
// Clock port. The domain takes the instant as a parameter, because ports
// live in the application layer and the domain never imports it.
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

  it('should_bind_the_application_clock_port_to_system_clock_when_app_module_compiles', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    expect(moduleRef.get(CLOCK)).toBeInstanceOf(SystemClock);
  });
});
