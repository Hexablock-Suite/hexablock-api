import type { PasswordHash } from '../../../src/domain/user/password-hash.js';

// Wrong example: a string in three public signatures. A private method may
// take a string.
export class Greeting {
  constructor(text: string) {
    this.normalize(text);
  }

  rename(text: string): void {
    this.normalize(text);
  }

  private normalize(text: string): void {
    text.trim();
  }
}

export interface Checker {
  verify(typed: string, hash: PasswordHash): Promise<boolean>;
}
