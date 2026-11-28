// The given steps of a Testing API. A given step returns the Testing API at
// once, so the steps chain. A step that awaits a port goes into this list,
// and the next when step runs the list, in order, before it calls the use
// case.
export class Arrangements {
  private readonly steps: (() => unknown)[] = [];

  add(step: () => unknown): void {
    this.steps.push(step);
  }

  // Runs each pending step once, in the order of the given steps.
  async run(): Promise<void> {
    for (let step = this.steps.shift(); step !== undefined; step = this.steps.shift()) {
      await step();
    }
  }
}
