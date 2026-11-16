// Wrong example: four exported constants with a primitive type. Only TITLE
// names its type. A constant that the module does not export passes.
const MIN = 3;
const SEPARATOR = '-';

export const NAME_PATTERN = `^[a-z${SEPARATOR}]{${MIN},}$`;
export const GREETING = 'hello';
export const TITLE: string = 'Ms';
export const LIMITS = Array.of(MIN, 9);
