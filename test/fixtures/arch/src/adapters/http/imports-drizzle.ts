// Wrong example: an HTTP adapter imports a package other than @nestjs/*.
import { sql } from 'drizzle-orm';

export const query = sql;
