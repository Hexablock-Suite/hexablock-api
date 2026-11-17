import { InMemoryProgressRepository } from './in-memory-progress-repository.js';
import {
  CONTRACT_USER_IDS,
  describeProgressRepositoryContract,
} from './progress-repository.contract.js';

// The fake knows the contract users, as the Drizzle adapter stores them.
describeProgressRepositoryContract(
  'InMemoryProgressRepository',
  () => new InMemoryProgressRepository(CONTRACT_USER_IDS),
);
