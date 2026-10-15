import { deriveStream, nextInt, shuffle, stateHash } from '@nukka/core';

export interface SmokeResult {
  readonly checks: number;
  readonly hash: string;
}

/**
 * Fast end-to-end check run in CI and by `pnpm smoke`. It currently
 * exercises the core foundations twice and requires identical results;
 * it grows into a short bot-match run as the match engine is built.
 */
export function runSmoke(seed = 1): SmokeResult {
  const run = () => {
    let deck = deriveStream(seed, 'deck');
    let rolls = deriveStream(seed, 'roll-off');
    const [order, nextDeck] = shuffle(deck, ['a', 'b', 'c', 'd', 'e', 'f']);
    deck = nextDeck;
    const values: number[] = [];
    for (let i = 0; i < 20; i++) {
      const [roll, next] = nextInt(rolls, 1, 6);
      values.push(roll);
      rolls = next;
    }
    return stateHash({ order, values, deck, rolls });
  };
  const first = run();
  const second = run();
  if (first !== second) {
    throw new Error(`smoke: determinism check failed (${first} vs ${second})`);
  }
  return { checks: 1, hash: first };
}
