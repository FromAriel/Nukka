import { describe, expect, it } from 'vitest';
import { runSmoke } from './smoke.js';

describe('runSmoke', () => {
  it('passes and is repeatable', () => {
    expect(runSmoke(3).hash).toBe(runSmoke(3).hash);
  });
});
