# adapters/logging

`NestLogger` implements the `Logger` port with the logger of `@nestjs/common`. It writes each `UseCaseLogEntry` as one text line, at the level of its outcome. Imports `src/application` and `@nestjs/common`, the one package it may import (rule `logging-adapters-import-only-nest-common`); never `src/infrastructure`.
