import { randomUUID } from 'node:crypto';
import type { UserIdGenerator } from '../../application/ports/user-id-generator.js';
import { UserId } from '../../domain/shared/user-id.js';

// Production adapter of the UserIdGenerator port: a random UUID v4.
// randomUUID() always gives a UUID, so a failed UserId is a defect of the
// code, and the adapter throws.
export class RandomUserIdGenerator implements UserIdGenerator {
  next(): UserId {
    const id = UserId.from(randomUUID());
    if (!id.ok) {
      throw new Error('randomUUID() must give a UUID.');
    }
    return id.value;
  }
}
