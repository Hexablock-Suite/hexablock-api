import { globSync, readdirSync, readFileSync } from 'node:fs';
import { matchesGlob, resolve } from 'node:path';
import e2eConfig from '../../vitest.config.e2e.js';
import unitConfig from '../../vitest.config.js';
import behaviorConfig from '../../vitest.behavior.config.js';
import gatesConfig, { OPENAPI_DRIFT_FILE } from '../../vitest.gates.config.js';

const ROOT = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(resolve(ROOT, path), 'utf8');

type Config = typeof unitConfig;

// The test files that a Vitest config selects, as paths from the root.
const filesOf = (config: Config): string[] => {
  const exclude = config.test?.exclude ?? [];
  return globSync(config.test?.include ?? [], { cwd: ROOT })
    .filter((path) => !exclude.some((pattern) => matchesGlob(path, pattern)))
    .sort();
};

// Vitest matches its name pattern against the describe titles and the test
// title, joined by ' > '.
const runsTest = (config: Config, fullName: string): boolean => {
  const pattern = config.test?.testNamePattern;
  return pattern === undefined || new RegExp(pattern).test(fullName);
};

// #253: the gate suite and the behavior suite split the tests of `pnpm test`.
// A gate reads the code, the documents or the configuration to hold a rule.
// A behavior test runs the code and checks what it does.
describe('test suites', () => {
  it('should_select_each_test_file_of_pnpm_test_in_one_suite_when_the_suites_split_the_tests', () => {
    const all = [...new Set([...filesOf(unitConfig), ...filesOf(e2eConfig)])].sort();
    const gates = filesOf(gatesConfig);
    const behavior = filesOf(behaviorConfig);

    expect([...new Set([...gates, ...behavior])].sort()).toEqual(all);
    expect(gates.filter((file) => behavior.includes(file))).toEqual([OPENAPI_DRIFT_FILE]);
  });

  it('should_select_every_gate_file_when_the_gate_suite_runs', () => {
    const gateFolder = readdirSync(resolve(ROOT, 'test/gates'))
      .filter((file) => file.endsWith('.spec.ts'))
      .map((file) => `test/gates/${file}`);

    expect(filesOf(gatesConfig)).toEqual(
      [
        ...gateFolder,
        'test/domain/level/level-problem.spec.ts',
        'test/health.e2e-spec.ts',
        'test/integration/in-memory-database.spec.ts',
      ].sort(),
    );
  });

  it('should_run_only_the_openapi_drift_test_of_health_in_the_gate_suite_when_the_suites_split_its_file', () => {
    const source = read(OPENAPI_DRIFT_FILE);
    const describeTitle = /^describe\('([^']+)'/m.exec(source)?.[1];
    const names = [...source.matchAll(/^ +it\('([^']+)'/gm)].map(
      (match) => `${describeTitle} > ${match[1]}`,
    );
    const otherGates = filesOf(gatesConfig).filter((file) => file !== OPENAPI_DRIFT_FILE);

    expect(names.length).toBeGreaterThan(1);
    expect(names.filter((name) => runsTest(gatesConfig, name))).toEqual([
      'HTTP entry points > should_match_committed_openapi_file_when_docs_json_is_requested',
    ]);
    expect(names.filter((name) => runsTest(behaviorConfig, name))).toEqual(
      names.filter((name) => !runsTest(gatesConfig, name)),
    );
    expect(otherGates.filter((file) => read(file).includes(`describe('${describeTitle}'`))).toEqual(
      [],
    );
  });

  it('should_run_each_suite_with_its_own_script_when_package_json_lists_the_scripts', () => {
    const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> })
      .scripts;

    expect(scripts['test:gates']).toBe('vitest run --config ./vitest.gates.config.ts');
    expect(scripts['test:behavior']).toBe('vitest run --config ./vitest.behavior.config.ts');
  });
});
