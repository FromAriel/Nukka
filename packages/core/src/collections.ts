/**
 * Deterministic iteration helpers. Simulation code must never depend on
 * object insertion order (Technical Architecture spec §4.3).
 */

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortedKeys<K extends string>(record: Readonly<Partial<Record<K, unknown>>>): K[] {
  // eslint-disable-next-line no-restricted-syntax -- the sanctioned wrapper
  return (Object.keys(record) as K[]).sort(compareIds);
}

/** Entries sorted by key; keys whose value is undefined are skipped. */
export function sortedEntries<K extends string, V>(
  record: Readonly<Partial<Record<K, V>>>,
): [K, V][] {
  const result: [K, V][] = [];
  for (const key of sortedKeys(record)) {
    const value = record[key];
    if (value !== undefined) result.push([key, value as V]);
  }
  return result;
}

/** Copies a partial record, dropping undefined values. */
export function compactRecord<V>(record: Readonly<Partial<Record<string, V>>>): Record<string, V> {
  return Object.fromEntries(sortedEntries(record));
}

export function sortedIds<T extends string>(ids: Iterable<T>): T[] {
  return [...ids].sort(compareIds);
}
