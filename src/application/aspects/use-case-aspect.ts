import type { UseCase } from '../use-case.js';

// The abstract Decorator of the use cases (§3.5, decision 7 of
// docs/architecture/classes.md). It implements the input port and keeps the
// inner use case it wraps. Its execute() runs the inner use case and returns
// the response unchanged. Each aspect extends it and adds one cross-cutting
// concern around super.execute(). The inner use case holds no aspect code.
// It is a plain class, not a Nest interceptor (rule R-application-pure).
export abstract class UseCaseAspect<TRequest, TResponse> implements UseCase<TRequest, TResponse> {
  constructor(protected readonly inner: UseCase<TRequest, TResponse>) {}

  execute(request: TRequest): Promise<TResponse> {
    return this.inner.execute(request);
  }
}
