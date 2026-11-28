import type { IncomingLevel } from '../../../src/application/levels/update-levels.use-case.js';
import { levelExample } from '../level-format.js';
import { incomingLevel } from '../level-update.js';

// One raw item of a list of a raw section, as a test changes it.
type RawItem = Record<string, unknown>;

// The Fit section of the format document and its items, so a test can
// change one item: the figure, the pieces a, b and c, and the witness
// entries that place them.
export interface FitParts {
  readonly section: Record<string, unknown>;
  readonly figure: number[][];
  readonly pieceA: RawItem;
  readonly pieceB: RawItem;
  readonly pieceC: RawItem;
  readonly placeA: RawItem;
  readonly placeB: RawItem;
  readonly placeC: RawItem;
}

// How one piece of one cell lies in a Fit level of one cell: the cell of the
// piece, the rotation and the offset of its witness entry, and the one cell
// of the figure.
export interface OneCellPlacement {
  readonly cell: number[];
  readonly rotation: number;
  readonly at: number[];
  readonly figure: number[];
}

// Object Mother of the level data of the tests (#255). It builds the input of
// LevelValidators.check() as the border hands it over: the values of the
// common part as domain values, built with their public factories, and the
// section as it arrives. The data comes from the complete examples of
// docs/level-format.md, so the document and the tests cannot drift. Each call
// parses the document again, so a test can change its copy. It knows no test
// double.
export class LevelMother {
  static fitParts(): FitParts {
    const section = levelExample('hexa-fit').section;
    const [pieceA, pieceB, pieceC] = section.pieces as RawItem[];
    const [placeA, placeB, placeC] = section.witness as RawItem[];
    const figure = section.figure as number[][];
    return { section, figure, pieceA, pieceB, pieceC, placeA, placeB, placeC };
  }

  static sortSection(): Record<string, unknown> {
    return levelExample('hexa-sort').section;
  }

  // The Fit level of the format document, fit-01, with a raw section and a
  // topology. The section of the example and hex are the defaults.
  static fitLevel(
    section: unknown = LevelMother.fitParts().section,
    topology = 'hex',
  ): IncomingLevel {
    return { ...incomingLevel({ ...levelExample('hexa-fit'), topology }), section };
  }

  // The Sort level of the format document, sort-01, with a raw section and a
  // topology. The section of the example and hex are the defaults.
  static sortLevel(section: unknown = LevelMother.sortSection(), topology = 'hex'): IncomingLevel {
    return { ...incomingLevel({ ...levelExample('hexa-sort'), topology }), section };
  }

  // A Fit level with one piece of one cell on a topology. The witness turns
  // the cell and moves it, and the figure is one cell. So the level passes A5
  // only when the topology takes the cell of the piece to the cell of the
  // figure.
  static oneCellLevel(topology: string, placement: OneCellPlacement): IncomingLevel {
    const { cell, rotation, at, figure } = placement;
    return LevelMother.fitLevel(
      {
        ...LevelMother.fitParts().section,
        figure: [figure],
        pieces: [{ id: 'a', cells: [cell] }],
        witness: [{ piece: 'a', rotation, at }],
      },
      topology,
    );
  }
}
