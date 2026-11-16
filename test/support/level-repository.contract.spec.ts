import { InMemoryLevelRepository } from './in-memory-level-repository.js';
import { levelValidators } from './level-format.js';
import { describeLevelRepositoryContract } from './level-repository.contract.js';

describeLevelRepositoryContract(
  'InMemoryLevelRepository',
  () => new InMemoryLevelRepository(levelValidators()),
);
