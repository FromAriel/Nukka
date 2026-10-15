import { deriveStream, nextInt, shuffle, type RngState } from '../rng.js';
import type { GameState } from './state.js';

/** Reads a named stream from state, creating it from the match seed on first use. */
function stream(state: GameState, name: string): RngState {
  const saved = state.rng[name];
  if (saved && saved.length === 4) return saved as unknown as RngState;
  return deriveStream(state.meta.seed, name);
}

/** Draws an integer in [min, max] from a named stream, advancing it in place. */
export function rollInt(state: GameState, name: string, min: number, max: number): number {
  const [value, next] = nextInt(stream(state, name), min, max);
  state.rng[name] = [...next];
  return value;
}

/** Shuffles with a named stream, advancing it in place. */
export function shuffleWith<T>(state: GameState, name: string, items: readonly T[]): T[] {
  const [result, next] = shuffle(stream(state, name), items);
  state.rng[name] = [...next];
  return result;
}
