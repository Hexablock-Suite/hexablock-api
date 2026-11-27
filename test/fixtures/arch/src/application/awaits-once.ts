// Right example: the application awaits one read for all ids.
export async function readAll(
  ids: readonly string[],
  read: (ids: readonly string[]) => Promise<number[]>,
) {
  const found = await read(ids);
  return found.filter((value) => value > 0);
}
