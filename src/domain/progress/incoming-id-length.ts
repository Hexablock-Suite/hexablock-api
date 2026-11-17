import { Range } from '../shared/range.js';
import { CharacterCount } from '../user/character-count.js';

// A limit of this file is a fixed count, so a failed Result is a defect of
// the code.
function limit(count: number): CharacterCount {
  const result = CharacterCount.of(count);
  if (!result.ok) {
    throw new RangeError(`An id length limit breaks the rule ${result.error}.`);
  }
  return result.value;
}

// The length of a gameId or a levelId that a client sends: 1 to 64
// characters (#135). The columns are Postgres text and set no length, so
// this bound is a choice of the API: a slug such as hexa-fit or an id such
// as fit-01 needs far fewer characters. The range delivers its bounds to the
// OpenAPI limits and the messages of the border.
export const INCOMING_ID_LENGTH = Range.of(limit(1), limit(64));
