// Wrong example: a clock adapter imports a Node built-in.
import { randomUUID } from 'node:crypto';

export const uuid = randomUUID;
