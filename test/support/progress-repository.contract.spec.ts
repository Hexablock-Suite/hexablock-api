import { InMemoryProgressRepository } from './in-memory-progress-repository.js';
import { describeProgressRepositoryContract } from './progress-repository.contract.js';

describeProgressRepositoryContract(
  'InMemoryProgressRepository',
  () => new InMemoryProgressRepository(),
);
