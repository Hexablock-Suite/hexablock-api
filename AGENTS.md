# AGENTS.md

Rules for every contributor, human or agent, in this repository. Each rule names the gate that enforces it, or says "no gate". Run `pnpm verify` before you push; CI runs the same command in the `verify` job.

## Commands

- `pnpm verify`: lint, format:check, typecheck, test, arch, openapi:check, in that order.
- `pnpm test`: unit and gate tests, then e2e tests.
- `pnpm arch`: dependency-cruiser layer rules.
- `pnpm contract:verify`: verify the client pact against the API at `BACKEND_URL`. `PACT_FILE` picks a local pact.
- `pnpm openapi:export`: build the app and write `openapi/openapi.json`. `pnpm openapi:check` fails when that file is stale.

## Rules

- Write every artifact, comment and commit message in English. Gate: no gate. <!-- rule: R-english -->
- Write commit messages as Conventional Commits. Gate: `commitlint.config.cjs`, `.vite-hooks/commit-msg`, `test/gates/commit-message.gate.spec.ts`. <!-- rule: R-conventional-commits -->
- Name each test `should_<expected_result>_when_<condition>`. Gate: `vite.config.ts`, `test/gates/test-name.gate.spec.ts`. <!-- rule: R-test-names -->
- Keep `src/domain` free of imports from outside `src/domain`. Gate: `.dependency-cruiser.cjs`, `test/gates/architecture.gate.spec.ts`. <!-- rule: R-domain-pure -->
- Let `src/application` import only `src/domain`; build aspects as custom decorators, not Nest interceptors. Gate: `.dependency-cruiser.cjs`, `test/gates/architecture.gate.spec.ts`. <!-- rule: R-application-pure -->
- Never import `src/infrastructure` from `src/adapters`. Gate: `.dependency-cruiser.cjs`, `test/gates/architecture.gate.spec.ts`. <!-- rule: R-adapters-no-infrastructure -->
- Read time from the `Clock` port and randomness from an injected seeded source in `src/domain` and `src/application`. Gate: `vite.config.ts`, `scripts/lint/hexablock-plugin.js`, `test/gates/determinism.gate.spec.ts`. <!-- rule: R-deterministic-core -->
- Keep `pnpm verify` and the CI `verify` job in step. Gate: `.github/workflows/ci.yml`, `test/gates/ci-contract.spec.ts`. <!-- rule: R-verify-parity -->
- Run `pnpm openapi:export` after every HTTP change and commit `openapi/openapi.json`; the client generates its API types from it. Gate: `scripts/openapi/export.js`, `test/health.e2e-spec.ts`. <!-- rule: R-openapi-drift -->
- Keep every client pact interaction green against this API; a missing pact fails the job. Gate: the contract job in `.github/workflows/ci.yml`, `scripts/contract/verify-provider.js`, `test/gates/ci-contract.spec.ts`. <!-- rule: R-contract -->
- Never bypass a git hook; CI repeats every hook check. Gate: `.github/workflows/ci.yml`, `test/gates/ci-contract.spec.ts`. <!-- rule: R-no-hook-bypass -->
- Keep the README and AI_USAGE.md sections of the project statement. Gate: `test/gates/docs-skeleton.spec.ts`. <!-- rule: R-docs-skeleton -->
- Log AI help for each task in AI_USAGE.md. Gate: no gate. <!-- rule: R-ai-usage-log -->
- Merge to `main` only through a pull request with a green `verify` job. Gate: no gate. <!-- rule: R-protected-main -->
