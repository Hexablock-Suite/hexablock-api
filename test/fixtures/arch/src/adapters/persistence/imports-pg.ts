// Wrong example: a persistence adapter imports a package other than drizzle-orm.
import { Pool } from 'pg';

export const driver = Pool;
