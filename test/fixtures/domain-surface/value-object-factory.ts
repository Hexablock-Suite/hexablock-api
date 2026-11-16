import { err, ok, type Result } from '../../../src/domain/shared/result.js';
import type { ValueReceiver } from '../../../src/domain/shared/value-receiver.js';

// Right example: the factory of a value object takes the raw value. A value
// object declares a delivery operation (decision 15).
export class Nickname {
  private constructor(private readonly value: string) {}

  static of(value: string): Nickname {
    return new Nickname(value);
  }

  static create(raw: string): Result<Nickname, 'invalid-nickname'> {
    return raw === '' ? err('invalid-nickname') : ok(new Nickname(raw));
  }

  deliverTo(receiver: ValueReceiver<string>): void {
    receiver.receive(this.value);
  }
}

// A value object may take more than one raw value.
export class Cell {
  private constructor(
    private readonly column: number,
    private readonly row: number,
  ) {}

  static at(column: number, row: number): Cell {
    return new Cell(column, row);
  }

  deliverTo(receiver: ValueReceiver<string>): void {
    receiver.receive(`${this.column},${this.row}`);
  }
}
