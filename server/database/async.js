// Execute database-backed array operations in order, including inside transactions.
export async function asyncMap(items, fn) {
  const result = [];
  for (let i = 0; i < items.length; i++) result.push(await fn(items[i], i, items));
  return result;
}

export async function asyncForEach(items, fn) {
  for (let i = 0; i < items.length; i++) await fn(items[i], i, items);
}

export async function asyncFilter(items, fn) {
  const result = [];
  for (let i = 0; i < items.length; i++) if (await fn(items[i], i, items)) result.push(items[i]);
  return result;
}

export async function asyncEvery(items, fn) {
  for (let i = 0; i < items.length; i++) if (!(await fn(items[i], i, items))) return false;
  return true;
}
