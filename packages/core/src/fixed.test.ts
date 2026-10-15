import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ceilDiv, floorDiv, isqrt, mulPermille } from './fixed.js';

describe('integer math', () => {
  it('floorDiv rounds toward negative infinity', () => {
    expect(floorDiv(7, 2)).toBe(3);
    expect(floorDiv(-7, 2)).toBe(-4);
    expect(floorDiv(7, -2)).toBe(-4);
    expect(floorDiv(-8, 2)).toBe(-4);
  });

  it('ceilDiv rounds up', () => {
    expect(ceilDiv(7, 2)).toBe(4);
    expect(ceilDiv(8, 2)).toBe(4);
  });

  it('mulPermille applies terrain-style factors', () => {
    expect(mulPermille(1000, 750)).toBe(750);
    expect(mulPermille(10, 750)).toBe(7);
  });

  it('isqrt is the exact integer square root', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4_000_000_000_000 }), (n) => {
        const r = isqrt(n);
        return r * r <= n && (r + 1) * (r + 1) > n;
      }),
    );
  });

  it('rejects non-integers', () => {
    expect(() => isqrt(2.5)).toThrow(RangeError);
  });
});
