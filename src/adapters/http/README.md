# adapters/http

Nest controllers, request/response DTOs, `HttpErrorFilter` and `JwtAuthGuard` that translate HTTP to use cases. `JwtAuthGuard` calls the `AuthenticateToken` input port, never the `TokenIssuer` port. Imports `src/application` and `src/domain`; never `src/infrastructure`.
