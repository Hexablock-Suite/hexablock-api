# application

Use cases and the ports they use. `ports/` holds the output ports that the outer layers implement, such as `ports/clock.ts`, which `SystemClock` in `src/infrastructure` implements. A use case reads the instant from the `Clock` port and passes it to the domain. Imports only `src/domain`; no `@nestjs/*`, no adapters, no infrastructure.
