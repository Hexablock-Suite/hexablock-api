import { defineConfig } from 'vitest/config';
import unitConfig from './vitest.config.js';

// Gate tests (#253). A gate reads the code, the documents or the
// configuration to hold a rule of design or of process. A behavior test runs
// the code and checks what it does. `pnpm test` runs both kinds, and
// vitest.behavior.config.ts selects the behavior tests.
// Three gates live with behavior tests. The app repository names two of their
// paths, so they stay where they are.
export const OPENAPI_DRIFT_FILE = 'test/health.e2e-spec.ts';
const OPENAPI_DRIFT_DESCRIBE = 'HTTP entry points';
const OPENAPI_DRIFT_TEST = `${OPENAPI_DRIFT_DESCRIBE} > should_match_committed_openapi_file_when_docs_json_is_requested`;

export const GATE_FILES = [
  'test/gates/**/*.spec.ts',
  // Rule R-database-harness, requirement API-NFR-02.
  'test/integration/in-memory-database.spec.ts',
  // It compares docs/level-format.md and openapi/openapi.json with the code.
  'test/domain/level/level-problem.spec.ts',
  // Rule R-openapi-drift: only its drift test is a gate.
  OPENAPI_DRIFT_FILE,
];

// Vitest matches a name pattern against the describe titles and the test
// title, joined by ' > '. The gate suite skips the other tests of the drift
// file, and the behavior suite skips the drift test.
export const BEHAVIOR_TEST_NAMES = new RegExp(`^(?!${OPENAPI_DRIFT_TEST}$)`);
const GATE_TEST_NAMES = new RegExp(`^(?!${OPENAPI_DRIFT_DESCRIBE} > )|^${OPENAPI_DRIFT_TEST}$`);

export default defineConfig({
  ...unitConfig,
  test: {
    ...unitConfig.test,
    include: GATE_FILES,
    testNamePattern: GATE_TEST_NAMES,
  },
});
