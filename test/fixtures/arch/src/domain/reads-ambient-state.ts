// Wrong example: the domain reads the system clock and an unseeded random source.
export const roll = Math.random();
export const stamp = Date.now();
export const today = new Date();
export const label = Date();
