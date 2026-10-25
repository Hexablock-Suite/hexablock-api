// Wrong example: an adapter imports the infrastructure layer.
import { wiring } from '../../infrastructure/module.js';

export const controller = wiring;
