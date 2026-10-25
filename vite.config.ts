import { defineConfig } from 'vite-plus';

export default defineConfig({
  lint: {
    ignorePatterns: ['dist/**', 'coverage/**'],
    options: {
      typeAware: true,
    },
    env: {
      node: true,
    },
    rules: {
      'typescript/no-floating-promises': 'error',
    },
  },
  fmt: {
    ignorePatterns: ['dist/**', 'coverage/**', 'pnpm-lock.yaml'],
    singleQuote: true,
    trailingComma: 'all',
  },
});
