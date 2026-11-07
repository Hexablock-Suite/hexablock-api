// Fixed UUIDs for the test doubles. A UserId is a UUID, as the uuid columns
// users.id and progress.user_id ask (#64). The number n is the last group,
// so testUserId(1) is 00000000-0000-4000-8000-000000000001.
export function testUserId(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}
