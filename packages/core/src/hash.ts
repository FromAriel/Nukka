/**
 * Canonical state hashing (Technical Architecture spec §4.5). The same
 * logical value always serializes to the same text, whatever its key order.
 */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isSafeInteger(value)) {
        throw new TypeError(`state must contain only safe integers, got ${value}`);
      }
      return String(value);
    case 'string':
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
      const record = value as Record<string, unknown>;
      // eslint-disable-next-line no-restricted-syntax -- sorted immediately below
      const keys = Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort();
      return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
    }
    default:
      throw new TypeError(`cannot hash a value of type ${typeof value}`);
  }
}

const FNV64_OFFSET = 0xcbf29ce484222325n;
const FNV64_PRIME = 0x100000001b3n;
const MASK64 = 0xffffffffffffffffn;

/** FNV-1a 64-bit over the UTF-8 bytes of the canonical JSON, as 16 hex digits. */
export function stateHash(value: unknown): string {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  let hash = FNV64_OFFSET;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * FNV64_PRIME) & MASK64;
  }
  return hash.toString(16).padStart(16, '0');
}
