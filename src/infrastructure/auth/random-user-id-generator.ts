import { randomUUID } from 'node:crypto';
import type { UserIdGenerator } from '../../application/ports/user-id-generator.js';
import { UserId } from '../../domain/user/user-id.js';

// Production adapter of the UserIdGenerator port: a random UUID v4.
export class RandomUserIdGenerator implements UserIdGenerator {
  next(): UserId {
    return UserId.from(randomUUID());
  }
}
