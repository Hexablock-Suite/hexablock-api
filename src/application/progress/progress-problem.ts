// The expected failure of the progress use cases. A controller turns it into
// the ErrorDto body (decision 11). A value that breaks its rule stops at its
// factory: the mapper of the border builds the values of a request, so no
// broken value reaches a use case.
export type ProgressProblem = { readonly kind: 'progress-not-found' };
