// Wrong example: a crypto adapter imports a Node built-in other than node:crypto.
import { STATUS_CODES } from 'node:http';

export const codes = STATUS_CODES;
