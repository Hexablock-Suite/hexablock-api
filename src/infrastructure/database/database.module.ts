import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createDatabase, type Database } from './connection.js';

export const DATABASE = Symbol('DATABASE');

// AppModule does not import this module yet. See README.md in this folder.
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
