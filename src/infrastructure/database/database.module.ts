import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createDatabase, type Database } from './connection.js';

export const DATABASE = Symbol('DATABASE');

// AppModule imports this module. The pool opens a connection on the first query.
@Module({
  providers: [{ provide: DATABASE, useFactory: (): Database => createDatabase() }],
  exports: [DATABASE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async onApplicationShutdown(): Promise<void> {
    await this.database.$client.end();
  }
}
