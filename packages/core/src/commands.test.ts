import { describe, expect, it } from 'vitest';
import { checkSeq } from './commands.js';

describe('checkSeq', () => {
  it('accepts the first command and each next one', () => {
    expect(checkSeq(undefined, 1)).toEqual({ ok: true });
    expect(checkSeq(4, 5)).toEqual({ ok: true });
  });

  it('rejects duplicates, old commands and gaps', () => {
    expect(checkSeq(4, 4)).toEqual({ ok: false, code: 'duplicate' });
    expect(checkSeq(4, 2)).toEqual({ ok: false, code: 'out-of-order' });
    expect(checkSeq(4, 7)).toEqual({ ok: false, code: 'gap' });
  });
});
