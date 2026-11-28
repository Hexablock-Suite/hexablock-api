# adapters/clock

`SystemClock` implements the `Clock` port. It is the only reader of the system clock, and it builds a `SyncInstant` from the milliseconds since the epoch. `PerformanceStopwatch` implements the `Stopwatch` port: it reads the monotonic clock of the `performance` global, a global of JavaScript and not an import, so `LoggingAspect` measures the duration of each call (#181). Imports `src/application` and `src/domain` only: no package (rule `other-adapters-import-no-package`) and no Node built-in (rule `clock-adapters-import-no-built-in`); never `src/infrastructure`.
