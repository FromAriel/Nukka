import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { deriveStream, nextInt, nextUint32, seedState, shuffle, type RngState } from './rng.js';

describe('xoshiro128**', () => {
  it('matches the reference first output for state [1, 2, 3, 4]', () => {
    const [value] = nextUint32([1, 2, 3, 4]);
    expect(value).toBe(11520);
  });

  it('produces the same sequence from the same seed', () => {
    const draw = (state: RngState) => {
      const values: number[] = [];
      let current = state;
      for (let i = 0; i < 100; i++) {
        const [value, next] = nextUint32(current);
        values.push(value);
        current = next;
      }
      return values;
    };
    expect(draw(seedState(42))).toEqual(draw(seedState(42)));
    expect(draw(seedState(42))).not.toEqual(draw(seedState(43)));
  });

  it('keeps named streams independent', () => {
    const [deck] = nextUint32(deriveStream(7, 'deck'));
    const [fuses] = nextUint32(deriveStream(7, 'fuses'));
    expect(deck).not.toBe(fuses);
    expect(deriveStream(7, 'deck')).toEqual(deriveStream(7, 'deck'));
  });
});

describe('nextInt', () => {
  it('stays within bounds', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffffffff }),
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: 0, max: 5000 }),
        (seed, min, span) => {
          const [value] = nextInt(seedState(seed), min, min + span);
          return Number.isInteger(value) && value >= min && value <= min + span;
        },
      ),
    );
  });

  it('covers every value of a d6 roughly evenly', () => {
    const counts = [0, 0, 0, 0, 0, 0];
    let state = seedState(1);
    for (let i = 0; i < 6000; i++) {
      const [roll, next] = nextInt(state, 1, 6);
      counts[roll - 1]! += 1;
      state = next;
    }
    for (const count of counts) expect(count).toBeGreaterThan(850);
  });

  it('rejects invalid ranges', () => {
    expect(() => nextInt(seedState(1), 5, 4)).toThrow(RangeError);
  });
});

describe('shuffle', () => {
  it('returns a permutation and does not mutate the input', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffffffff }),
        fc.array(fc.integer()),
        (seed, items) => {
          const copy = [...items];
          const [shuffled] = shuffle(seedState(seed), items);
          expect(items).toEqual(copy);
          expect([...shuffled].sort((a, b) => a - b)).toEqual([...items].sort((a, b) => a - b));
        },
      ),
    );
  });
});
