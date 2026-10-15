/**
 * Deterministic iteration helpers. Simulation code must never depend on
 * object insertion order (Technical Architecture spec §4.3).
 */

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortedKeys<K extends string>(record: Readonly<Record<K, unknown>>): K[] {
  // eslint-disable-next-line no-restricted-syntax -- the sanctioned wrapper
  return (Object.keys(record) as K[]).sort(compareIds);
}

export function sortedEntries<K extends string, V>(record: Readonly<Record<K, V>>): [K, V][] {
  return sortedKeys(record).map((key) => [key, record[key]]);
}

export function sortedIds<T extends string>(ids: Iterable<T>): T[] {
  return [...ids].sort(compareIds);
}
