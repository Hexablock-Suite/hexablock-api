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

  it('should_report_foreign_package_in_http_when_http_adapter_imports_drizzle', () => {
    expect(violationsOf(report, 'http-adapters-import-only-nest')).toEqual([
      expect.stringMatching(/^src\/adapters\/http\/imports-drizzle\.ts -> .*drizzle-orm/),
    ]);
  });

  it('should_allow_nest_when_http_adapter_imports_it', () => {
    const fromNestFixture = report.violations.filter(
      (violation) => violation.from === 'src/adapters/http/imports-nest.ts',
    );

    expect(fromNestFixture).toEqual([]);
  });

  it('should_report_foreign_package_in_persistence_when_persistence_adapter_imports_pg', () => {
    expect(violationsOf(report, 'persistence-adapters-import-only-drizzle')).toEqual([
      expect.stringMatching(/^src\/adapters\/persistence\/imports-pg\.ts -> .*\/pg\//),
    ]);
  });

  it('should_report_persistence_in_http_when_http_adapter_imports_persistence_adapter', () => {
    expect(violationsOf(report, 'http-adapters-never-import-persistence')).toEqual([
      'src/adapters/http/imports-persistence.ts -> src/adapters/persistence/imports-drizzle.ts',
    ]);
  });

  it('should_report_http_in_persistence_when_persistence_adapter_imports_http_adapter', () => {
    expect(violationsOf(report, 'persistence-adapters-never-import-http')).toEqual([
      'src/adapters/persistence/imports-http.ts -> src/adapters/http/imports-nest.ts',
    ]);
  });

  it('should_report_package_in_adapter_helpers_when_root_adapter_imports_one', () => {
    expect(violationsOf(report, 'other-adapters-import-no-package')).toEqual([
      expect.stringMatching(/^src\/adapters\/imports-package\.ts -> .*@nestjs\/common/),
    ]);
  });

  it('should_report_foreign_package_in_jwt_when_jwt_adapter_imports_nest_common', () => {
    expect(violationsOf(report, 'jwt-adapters-import-only-nest-jwt')).toEqual([
      expect.stringMatching(/^src\/adapters\/jwt\/imports-nest-common\.ts -> .*@nestjs\/common/),
    ]);
  });

  it('should_allow_nest_jwt_when_jwt_adapter_imports_it', () => {
    const fromJwtFixture = report.violations.filter(
      (violation) => violation.from === 'src/adapters/jwt/imports-jwt.ts',
    );

    expect(fromJwtFixture).toEqual([]);
  });

  it('should_report_foreign_package_in_logging_when_logging_adapter_imports_nest_jwt', () => {
    expect(violationsOf(report, 'logging-adapters-import-only-nest-common')).toEqual([
      expect.stringMatching(/^src\/adapters\/logging\/imports-jwt\.ts -> .*@nestjs\/jwt/),
    ]);
  });

  it('should_allow_nest_common_when_logging_adapter_imports_it', () => {
    const fromLoggingFixture = report.violations.filter(
      (violation) => violation.from === 'src/adapters/logging/imports-nest-common.ts',
    );

    expect(fromLoggingFixture).toEqual([]);
  });

  it('should_report_foreign_built_in_in_crypto_when_crypto_adapter_imports_node_http', () => {
    expect(violationsOf(report, 'crypto-adapters-import-only-node-crypto')).toEqual([
      'src/adapters/crypto/imports-http.ts -> http',
    ]);
  });

  it('should_allow_node_crypto_when_crypto_adapter_imports_it', () => {
    const fromCryptoFixture = report.violations.filter(
      (violation) => violation.from === 'src/adapters/crypto/imports-crypto.ts',
    );

    expect(fromCryptoFixture).toEqual([]);
  });

  it('should_report_built_in_in_clock_when_clock_adapter_imports_node_crypto', () => {
    expect(violationsOf(report, 'clock-adapters-import-no-built-in')).toEqual([
      'src/adapters/clock/imports-crypto.ts -> crypto',
    ]);
  });

  // Option C of #212: every class that implements a port lives in layer 3.
  // AppModule imports the ports only to bind them.
  it('should_report_port_in_infrastructure_when_infrastructure_file_other_than_app_module_imports_a_port', () => {
    expect(violationsOf(report, 'infrastructure-imports-no-port')).toEqual([
      'src/infrastructure/implements-port.ts -> src/application/ports/clock.ts',
    ]);
  });

  // Persistence adapters cannot import src/infrastructure, so the tables they
  // query live next to them. drizzle-kit reads the same file.
  it('should_read_the_schema_from_the_persistence_adapter_when_drizzle_kit_generates_migrations', async () => {
    const { default: drizzleConfig } = await import('../../drizzle.config.js');

    expect(drizzleConfig.schema).toBe('./src/adapters/persistence/schema.ts');
  });
});
