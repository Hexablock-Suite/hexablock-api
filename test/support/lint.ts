import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

export interface LintDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly filename: string;
}

const ROOT = resolve(import.meta.dirname, '../..');
const VP = resolve(ROOT, 'node_modules/.bin/vp');

// Lints one file with the project config. The fixtures sit in an ignored
// folder, so the run passes --no-ignore. The JSON output keeps the check
// independent of the human-readable text.
export function lintFile(relativePath: string): LintDiagnostic[] {
  const run = spawnSync(VP, ['lint', '--no-ignore', '-f', 'json', relativePath], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (run.error) {
    throw run.error;
  }
  const start = run.stdout.indexOf('{');
  if (start < 0) {
    throw new Error(`vp lint printed no JSON. stderr: ${run.stderr}`);
  }
  const report = JSON.parse(run.stdout.slice(start)) as { diagnostics: LintDiagnostic[] };
  return report.diagnostics;
}

export function codesOf(diagnostics: LintDiagnostic[]): string[] {
  return diagnostics.map((diagnostic) => diagnostic.code);
}
