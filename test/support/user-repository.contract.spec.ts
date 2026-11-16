import { InMemoryUserRepository } from './auth/fakes.js';
import { describeUserRepositoryContract } from './user-repository.contract.js';

describeUserRepositoryContract('InMemoryUserRepository', () => new InMemoryUserRepository());
