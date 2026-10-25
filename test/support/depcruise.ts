import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

export interface ArchViolation {
  readonly from: string;
  readonly to: string;
  readonly rule: { readonly name: string; readonly severity: string };
}

export interface ArchReport {
  readonly exitCode: number | null;
  readonly violations: ArchViolation[];
}

const ROOT = resolve(import.meta.dirname, '../..');
const DEPCRUISE = resolve(ROOT, 'node_modules/.bin/depcruise');
const CONFIG = resolve(ROOT, '.dependency-cruiser.cjs');

function cruise(fixtureRoot: string, extraArgs: string[]) {
  const run = spawnSync(DEPCRUISE, ['src', '--config', CONFIG, ...extraArgs], {
    cwd: resolve(ROOT, fixtureRoot),
    encoding: 'utf8',
  });
  if (run.error) {
    throw run.error;
  }
  return run;
}

// Runs the project rules on a fixture tree. The run starts inside the
// fixture folder, so its files match the ^src/ paths of the rules.
// The exit code comes from the default reporter, as in the arch script.
// The JSON reporter always exits 0, so it only supplies the violations.
export function cruiseFixture(fixtureRoot: string): ArchReport {
  const gate = cruise(fixtureRoot, []);
  const json = cruise(fixtureRoot, ['--output-type', 'json']);
  const report = JSON.parse(json.stdout) as { summary: { violations: ArchViolation[] } };
  return { exitCode: gate.status, violations: report.summary.violations };
}

export function violationsOf(report: ArchReport, ruleName: string): string[] {
  return report.violations
    .filter((violation) => violation.rule.name === ruleName)
    .map((violation) => `${violation.from} -> ${violation.to}`)
    .sort();
}
