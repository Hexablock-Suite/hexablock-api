import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
} from '@nestjs/common';
import { HttpAdapterHost, ModuleRef } from '@nestjs/core';
import {
  LEVEL_REPOSITORY,
  type LevelRepository,
} from '../../../src/application/ports/level-repository.js';
import type { TestDatabase } from '../test-database.js';
import {
  PROVIDER_STATES,
  removeEveryRow,
  type StateParams,
  type StateValues,
} from './provider-states.js';

// The token of the database of the provider composition.
export const PROVIDER_DATABASE = Symbol('ProviderDatabase');

// The body that the Pact verifier posts before and after each interaction.
// An interaction with no state gets an empty state name.
interface StateChangeBody {
  readonly state?: unknown;
  readonly params?: unknown;
  readonly action?: unknown;
}

// The state-change endpoint of the contract job (#151). Only the provider
// composition mounts it, never AppModule: it writes any data for anyone.
// A setup runs the handler of the state and answers its values. A teardown
// removes every row, so the next interaction starts on an empty database.
@Controller('_pact/provider-states')
export class ProviderStatesController {
  constructor(
    @Inject(PROVIDER_DATABASE) private readonly database: TestDatabase,
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
    @Inject(ModuleRef) private readonly moduleRef: ModuleRef,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async change(@Body() body: StateChangeBody): Promise<StateValues> {
    if (body.action === 'teardown') {
      await removeEveryRow(this.database);
      return {};
    }
    const state = typeof body.state === 'string' ? body.state : '';
    if (state === '') {
      return {};
    }
    const setup = PROVIDER_STATES[state];
    if (setup === undefined) {
      throw new BadRequestException(
        `Unknown provider state "${state}". Known states: ${Object.keys(PROVIDER_STATES).join(', ')}.`,
      );
    }
    return setup(
      {
        server: this.adapterHost.httpAdapter.getHttpServer(),
        levels: this.moduleRef.get<LevelRepository>(LEVEL_REPOSITORY, { strict: false }),
        database: this.database,
      },
      paramsOf(body.params),
    );
  }
}

function paramsOf(params: unknown): StateParams {
  return typeof params === 'object' && params !== null ? (params as StateParams) : {};
}
