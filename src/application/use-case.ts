// The one input port contract (decision 7 of docs/architecture/classes.md).
// Each input port binds it, so one aspect can wrap any use case (§3.5).
export interface UseCase<TRequest, TResponse> {
  execute(request: TRequest): Promise<TResponse>;
}
