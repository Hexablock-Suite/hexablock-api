# infrastructure

Nest modules, configuration and system adapters such as the clock. `AppModule` is the composition root: it binds each port of `src/application` to its adapter, for example `CLOCK` to `SystemClock`. `src/main.ts` only starts it. May import every layer; no layer imports it except `src/main.ts`.
