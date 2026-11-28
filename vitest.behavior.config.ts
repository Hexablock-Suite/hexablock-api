import { defineConfig } from 'vitest/config';
import e2eConfig from './vitest.config.e2e.js';
import unitConfig from './vitest.config.js';
import { BEHAVIOR_TEST_NAMES, GATE_FILES, OPENAPI_DRIFT_FILE } from './vitest.gates.config.js';

// Behavior tests (#253): every test of `pnpm test` that is not a gate, the
// e2e tests included. vitest.gates.config.ts says which tests are gates.
export default defineConfig({
  ...unitConfig,
  test: {
    ...unitConfig.test,
    include: [...(unitConfig.test?.include ?? []), ...(e2eConfig.test?.include ?? [])],
    exclude: [
      ...new Set([...(unitConfig.test?.exclude ?? []), ...(e2eConfig.test?.exclude ?? [])]),
      ...GATE_FILES.filter((file) => file !== OPENAPI_DRIFT_FILE),
    ],
    testNamePattern: BEHAVIOR_TEST_NAMES,
  },
});
