import { defineConfig } from 'vite-plus';

// Test titles follow should_<expected_result>_when_<condition> (spec S5).
// describe titles stay free.
const TEST_TITLE = '^should_[a-z0-9_]+_when_[a-z0-9_]+$';

// The domain and the application stay deterministic (spec S6). The globs
// start with ** so the wrong examples in test/fixtures/arch match too.
const CORE_FILES = ['**/src/domain/**', '**/src/application/**'];
const USE_THE_PORT = 'Inject the Clock port or a seeded random source.';

export default defineConfig({
  lint: {
    // test/fixtures holds wrong examples on purpose. The gate tests lint
    // them with this config. The lint script skips them on the command line.
    ignorePatterns: ['dist/**', 'coverage/**'],
    plugins: ['typescript', 'unicorn', 'oxc', 'vitest'],
    jsPlugins: ['./scripts/lint/hexablock-plugin.js'],
    options: {
      typeAware: true,
    },
    env: {
      node: true,
    },
    rules: {
      'typescript/no-floating-promises': 'error',
      'vitest/valid-title': [
        'error',
        {
          mustMatch: {
            it: TEST_TITLE,
            test: TEST_TITLE,
          },
        },
      ],
    },
    overrides: [
      {
        files: CORE_FILES,
        rules: {
          'no-restricted-properties': [
            'error',
            { object: 'Math', property: 'random', message: USE_THE_PORT },
            { object: 'Date', property: 'now', message: USE_THE_PORT },
          ],
          'hexablock/no-current-date': 'error',
        },
      },
    ],
  },
  // pre-commit runs these on staged files. Fixtures stay out of the lint run.
  staged: {
    '*.{ts,js,cjs,mjs}':
      'vp lint --deny-warnings --ignore-pattern "test/fixtures/**" --no-error-on-unmatched-pattern',
    '*': 'vp fmt --no-error-on-unmatched-pattern',
  },
  fmt: {
    // Generated files keep the format of the tool that writes them.
    ignorePatterns: [
      'dist/**',
      'coverage/**',
      'pnpm-lock.yaml',
      'openapi/openapi.json',
      'drizzle/meta/**',
    ],
    singleQuote: true,
    trailingComma: 'all',
  },
});
