# adapters/clock

`SystemClock` implements the `Clock` port. It is the only reader of the system clock, and it builds a `SyncInstant` from the milliseconds since the epoch. Imports `src/application` and `src/domain` only: no package (rule `other-adapters-import-no-package`) and no Node built-in (rule `clock-adapters-import-no-built-in`); never `src/infrastructure`.
