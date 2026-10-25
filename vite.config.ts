import { defineConfig } from 'vite-plus';

// Test titles follow should_<expected_result>_when_<condition> (spec S5).
// describe titles stay free.
const TEST_TITLE = '^should_[a-z0-9_]+_when_[a-z0-9_]+$';

export default defineConfig({
  lint: {
    // test/fixtures holds wrong examples on purpose. The gate tests lint
    // them with this config. The lint script skips them on the command line.
    ignorePatterns: ['dist/**', 'coverage/**'],
    plugins: ['typescript', 'unicorn', 'oxc', 'vitest'],
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
  },
  fmt: {
    ignorePatterns: ['dist/**', 'coverage/**', 'pnpm-lock.yaml'],
    singleQuote: true,
    trailingComma: 'all',
  },
});
