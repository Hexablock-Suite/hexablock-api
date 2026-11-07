// What a log keeps of a thrown value: its name, its code when the code is a
// string, and the frames of its stack. It never keeps the message: a message
// is free text, and it can quote a value that the client sent. A getter of
// the thrown value can throw, so each caller calls describeThrown() inside a
// guard.
export interface ThrownValue {
  readonly name: string;
  readonly code: string | undefined;
  readonly frames: string | undefined;
}

// Describes a thrown value without its message. A value that is not an Error
// gives only its type, because its text can quote a value that the client sent.
export function describeThrown(value: unknown): ThrownValue {
  if (!(value instanceof Error)) {
    return { name: typeof value, code: undefined, frames: undefined };
  }
  const code: unknown = (value as { code?: unknown }).code;
  return {
    name: typeof value.name === 'string' ? value.name : 'Error',
    code: typeof code === 'string' ? code : undefined,
    frames: framesOf(value),
  };
}

// The stack without its header. V8 writes the header as the text of
// Error.prototype.toString(): the name, then the message, and the message
// can span lines. A stack that does not start with that exact header can
// hold the message anywhere, so the function then gives no frames.
function framesOf(error: Error): string | undefined {
  const stack: unknown = error.stack;
  const header = `${Error.prototype.toString.call(error)}\n`;
  if (typeof stack !== 'string' || !stack.startsWith(header)) {
    return undefined;
  }
  const frames = stack.slice(header.length);
  return frames === '' ? undefined : frames;
}
