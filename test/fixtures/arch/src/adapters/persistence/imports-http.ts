// Wrong example: a persistence adapter imports an HTTP adapter.
import { framework } from '../http/imports-nest.js';

export const controller = framework;
