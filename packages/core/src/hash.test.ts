import { describe, expect, it } from 'vitest';
import { canonicalJson, stateHash } from './hash.js';

describe('stateHash', () => {
  it('ignores key order', () => {
    expect(stateHash({ b: 1, a: { d: [1, 2], c: 'x' } })).toBe(
      stateHash({ a: { c: 'x', d: [1, 2] }, b: 1 }),
    );
  });

  it('changes when a value changes', () => {
    expect(stateHash({ a: 1 })).not.toBe(stateHash({ a: 2 }));
  });

  it('skips undefined fields', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it('rejects floating-point values', () => {
    expect(() => stateHash({ a: 0.5 })).toThrow(TypeError);
  });

  it('is stable across runs', () => {
    expect(stateHash({ round: 1, tension: { value: 10, floor: 0 } })).toMatchInlineSnapshot(
      `"853f5e5afd8b09f6"`,
    );
  });
});
