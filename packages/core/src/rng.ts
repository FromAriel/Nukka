/**
 * Seeded xoshiro128** generator with named streams (Technical Architecture
 * spec §4.2). State is a plain tuple so it can live in GameState and be
 * saved, hashed and replayed.
 */

export type RngState = readonly [number, number, number, number];

export type StreamName = string;

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** FNV-1a 32-bit over the UTF-16 code units of a string. */
export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function splitmix32(seed: number): () => number {
  let z = seed >>> 0;
  return () => {
    z = (z + 0x9e3779b9) | 0;
    let t = z ^ (z >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    t ^= t >>> 15;
    return t >>> 0;
  };
}

export function seedState(seed: number): RngState {
  const next = splitmix32(seed);
  const state: [number, number, number, number] = [next(), next(), next(), next()];
  if (state.every((word) => word === 0)) state[0] = 1;
  return state;
}

/** Derives an independent stream from the match seed and a purpose name. */
export function deriveStream(matchSeed: number, name: StreamName): RngState {
  return seedState((matchSeed ^ fnv1a32(name)) >>> 0);
}

/** Returns the next unsigned 32-bit value and the advanced state. */
export function nextUint32(state: RngState): [number, RngState] {
  const [s0, s1, s2, s3] = state;
  const result = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
  const t = (s1 << 9) >>> 0;
  let n2 = (s2 ^ s0) >>> 0;
  let n3 = (s3 ^ s1) >>> 0;
  const n1 = (s1 ^ n2) >>> 0;
  const n0 = (s0 ^ n3) >>> 0;
  n2 = (n2 ^ t) >>> 0;
  n3 = rotl(n3, 11);
  return [result, [n0, n1, n2, n3]];
}

const TWO_POW_32 = 0x1_0000_0000;

/** Uniform integer in [min, maxInclusive], without modulo bias. */
export function nextInt(state: RngState, min: number, maxInclusive: number): [number, RngState] {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(maxInclusive) || maxInclusive < min) {
    throw new RangeError(`invalid range [${min}, ${maxInclusive}]`);
  }
  const range = maxInclusive - min + 1;
  if (range > TWO_POW_32) throw new RangeError('range larger than 2^32');
  const limit = TWO_POW_32 - (TWO_POW_32 % range);
  let current = state;
  for (;;) {
    const [value, next] = nextUint32(current);
    current = next;
    if (value < limit) return [min + (value % range), current];
  }
}

/** Fisher–Yates shuffle returning a new array and the advanced state. */
export function shuffle<T>(state: RngState, items: readonly T[]): [T[], RngState] {
  const result = [...items];
  let current = state;
  for (let i = result.length - 1; i > 0; i--) {
    const [j, next] = nextInt(current, 0, i);
    current = next;
    const swap = result[i] as T;
    result[i] = result[j] as T;
    result[j] = swap;
  }
  return [result, current];
}
