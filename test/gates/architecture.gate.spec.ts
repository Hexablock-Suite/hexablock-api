import { cruiseFixture, violationsOf } from '../support/depcruise.js';

// Gate S6: inner layers know nothing about outer layers.
describe('architecture gate', () => {
  const report = cruiseFixture('test/fixtures/arch');

  it('should_fail_when_any_layer_rule_is_broken', () => {
    expect(report.exitCode).not.toBe(0);
  });

  it('should_report_domain_purity_when_domain_imports_outside_domain', () => {
    expect(violationsOf(report, 'domain-imports-only-domain')).toEqual([
      'src/domain/imports-application.ts -> src/application/use-case.ts',
      expect.stringMatching(/^src\/domain\/imports-framework\.ts -> .*@nestjs\/common/),
    ]);
  });

  it('should_report_application_purity_when_application_imports_beyond_domain', () => {
    expect(violationsOf(report, 'application-imports-only-domain')).toEqual([
      'src/application/imports-adapter.ts -> src/adapters/http/imports-infrastructure.ts',
      expect.stringMatching(/^src\/application\/imports-framework\.ts -> .*@nestjs\/common/),
    ]);
  });

  it('should_report_adapter_leak_when_adapter_imports_infrastructure', () => {
    expect(violationsOf(report, 'adapters-never-import-infrastructure')).toEqual([
      'src/adapters/http/imports-infrastructure.ts -> src/infrastructure/module.ts',
    ]);
  });

  it('should_report_framework_in_persistence_when_persistence_adapter_imports_nest', () => {
    expect(violationsOf(report, 'persistence-adapters-never-import-nest')).toEqual([
      expect.stringMatching(
        /^src\/adapters\/persistence\/imports-framework\.ts -> .*@nestjs\/common/,
      ),
    ]);
  });

  it('should_allow_drizzle_when_persistence_adapter_imports_it', () => {
    const fromDrizzleFixture = report.violations.filter(
      (violation) => violation.from === 'src/adapters/persistence/imports-drizzle.ts',
    );

    expect(fromDrizzleFixture).toEqual([]);
  });

  // Persistence adapters cannot import src/infrastructure, so the tables they
  // query live next to them. drizzle-kit reads the same file.
  it('should_read_the_schema_from_the_persistence_adapter_when_drizzle_kit_generates_migrations', async () => {
    const { default: drizzleConfig } = await import('../../drizzle.config.js');

    expect(drizzleConfig.schema).toBe('./src/adapters/persistence/schema.ts');
  });
});
