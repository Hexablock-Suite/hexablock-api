# adapters/http

Nest controllers, request/response DTOs, `HttpErrorFilter` and `JwtAuthGuard` that translate HTTP to use cases. `JwtAuthGuard` calls the `AuthenticateToken` input port, never the `TokenIssuer` port. `ProgressDtoMapper` translates between the progress DTOs and `PlayerProgress`, so `ProgressController` holds no translation code. Imports `src/application` and `src/domain`; never `src/infrastructure`.
