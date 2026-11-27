// Right example: the composition root imports the ports to bind them.
import type { Clock } from '../application/ports/clock.js';

export const clockOf = (clock: Clock): Clock => clock;
