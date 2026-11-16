// Wrong example: a Date in the parameter of a method and of an exported
// function.
export class Timeline {
  private constructor(private lastMs: number) {}

  recordAt(at: Date): void {
    this.lastMs = at.getTime();
  }
}

export function startAt(at: Date): void {
  at.getTime();
}
