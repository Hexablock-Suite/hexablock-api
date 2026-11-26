// Wrong example: an HTTP adapter imports a persistence adapter.
import { query } from '../persistence/imports-drizzle.js';

export const repository = query;
