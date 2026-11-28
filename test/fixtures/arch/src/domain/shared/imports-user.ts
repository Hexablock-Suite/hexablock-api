// Wrong example: src/domain/shared/ imports an aggregate folder.
import { account } from '../user/account.js';

export function readsTheUser(): boolean {
  return account();
}
