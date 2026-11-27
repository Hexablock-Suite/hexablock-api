// Wrong example: the application awaits one read per pass of a loop.
export async function readEach(ids: readonly string[], read: (id: string) => Promise<number>) {
  const found: number[] = [];
  for (const id of ids) {
    found.push(await read(id));
  }
  let index = 0;
  while (index < ids.length) {
    found.push(await read(ids[index] ?? ''));
    index += 1;
  }
  return found;
}
