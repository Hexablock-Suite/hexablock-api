# HexaBlock API

## Project Title & Badges

TODO: add the CI badge once the GitHub organization exists.

## Description

TODO: describe the REST backend for users, progress, leaderboards and level definitions of the four HexaBlock games.

## Architecture

TODO: explain the Clean layers (`src/domain`, `src/application`, `src/adapters`, `src/infrastructure`) and the `pnpm arch` rules that guard them.

## Generic Engine

TODO: explain how the API stores level definitions for the single generic engine and its variants.

## Design Patterns

TODO: list each pattern with its location and the requirement it serves.

## SOLID Principles

TODO: show one concrete example per principle from this codebase.

## AOP

TODO: describe the cross-cutting aspects, implemented as custom decorators outside `src/application`.

## Getting Started

TODO: add environment variables once persistence lands. Today:

```bash
fnm use            # reads .node-version (Node 26)
pnpm install       # also installs the git hooks
pnpm start:dev     # http://localhost:3000/health, docs at /docs, JSON at /docs-json
```

## Running Tests

TODO: describe the test layers as they grow. Today:

```bash
pnpm test          # unit and gate tests, then e2e tests
pnpm test:unit     # unit and gate tests only
pnpm test:e2e      # HTTP end-to-end tests only
pnpm verify        # lint, format:check, typecheck, test, arch (the CI gate)
```

## AI Usage Documentation

TODO: summarize the AI tools used. The full log lives in [AI_USAGE.md](AI_USAGE.md).

## Contributing

TODO: add review rules once `main` is protected. Today: branch from `main` (`feat/<topic>`, `fix/<topic>`), write Conventional Commits in English (commitlint checks them), open a pull request, and merge only when the `verify` job is green.

## License

TODO: confirm the copyright holder. The code is under the [MIT License](LICENSE).
