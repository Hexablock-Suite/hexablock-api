// Wrong example: the domain reads the ambient globals crypto, performance
// and process instead of taking values from an injected port or parameter.
export const identifier = crypto.randomUUID();
export const entropy = crypto.getRandomValues(new Uint8Array(8));
export const elapsed = performance.now();
export const mode = process.env.SOME_VAR;
