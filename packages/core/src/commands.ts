/**
 * Command envelope and sequence checks (Technical Architecture spec §8).
 * Concrete command types are added as each rule system is built.
 */

import type { PlayerId } from './engine/state.js';

export interface CommandEnvelope<C = unknown> {
  readonly matchId: string;
  readonly playerId: PlayerId;
  /** Per player, strictly increasing. */
  readonly seq: number;
  readonly cmd: C;
}

export type SeqCheck = { ok: true } | { ok: false; code: 'duplicate' | 'out-of-order' | 'gap' };

/**
 * Accepts only the next sequence number for a player, so late, repeated or
 * reordered commands can never apply twice.
 */
export function checkSeq(lastAccepted: number | undefined, seq: number): SeqCheck {
  const expected = (lastAccepted ?? 0) + 1;
  if (seq === expected) return { ok: true };
  if (lastAccepted !== undefined && seq <= lastAccepted) {
    return { ok: false, code: seq === lastAccepted ? 'duplicate' : 'out-of-order' };
  }
  return { ok: false, code: 'gap' };
}
