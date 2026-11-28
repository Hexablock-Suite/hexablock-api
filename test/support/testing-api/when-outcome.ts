type State<T> =
  | { readonly ran: false }
  | { readonly ran: true; readonly resolved: true; readonly value: T }
  | { readonly ran: true; readonly resolved: false; readonly reason: unknown; read: boolean };

type Recorded<T> = Exclude<State<T>, { ran: false }>;

// The outcome of the last when step of a Testing API: the value of the use
// case, or its rejection. A when step records it, and each then step reads
// it first. A then step that runs before any when step fails with
// NO_WHEN_STEP, so a when step without await cannot pass a test that reads
// an old state. A then step that does not expect a rejection fails with it.
export class WhenOutcome<T> {
  static readonly NO_WHEN_STEP = 'A then step ran before any when step.';

  private state: State<T> = { ran: false };

  // Runs the call of the use case and keeps its value or its rejection. A
  // rejection that no then step read fails the next when step.
  async record(run: () => Promise<T>): Promise<void> {
    if (this.state.ran) {
      this.throwUnreadRejection(this.state);
    }
    try {
      this.state = { ran: true, resolved: true, value: await run() };
    } catch (reason) {
      this.state = { ran: true, resolved: false, reason, read: false };
    }
  }

  // The value of the when step. It throws the rejection of the when step.
  value(): T {
    const state = this.recorded();
    this.throwUnreadRejection(state);
    if (!state.resolved) {
      throw state.reason;
    }
    return state.value;
  }

  // The rejection of the when step. It fails when the when step resolved.
  rejection(): unknown {
    const state = this.recorded();
    if (state.resolved) {
      throw new Error('The when step resolved, so it has no rejection.');
    }
    state.read = true;
    return state.reason;
  }

  // Checks that a when step ran. It throws a rejection that no then step read.
  ran(): void {
    this.throwUnreadRejection(this.recorded());
  }

  private recorded(): Recorded<T> {
    if (!this.state.ran) {
      throw new Error(WhenOutcome.NO_WHEN_STEP);
    }
    return this.state;
  }

  private throwUnreadRejection(state: Recorded<T>): void {
    if (!state.resolved && !state.read) {
      state.read = true;
      throw state.reason;
    }
  }
}
