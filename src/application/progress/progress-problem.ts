// The expected failure of the progress use cases. A controller turns it into
// the ErrorDto body (decision 11). A value that breaks its rule stops at its
// factory: the mapper of the border builds the values of a request, so no
// broken value reaches a use case. A sync fails with unknown-user when the
// user of the token goes between the guard and the write (#137).
export type ProgressProblem =
  | { readonly kind: 'progress-not-found' }
  | { readonly kind: 'unknown-user' };
