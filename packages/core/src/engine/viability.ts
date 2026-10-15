import { sortedEntries } from '../collections.js';
import type { MatchContext } from './context.js';
import type { EventSink } from './events.js';
import type { GameState, PlayerId } from './state.js';

/**
 * Removes a country that is no longer viable (Map Structure spec §5.3): its
 * territories become neutral with reduced militia, and its units,
 * installations and stockpiles are removed.
 */
export function eliminatePlayer(
  ctx: MatchContext,
  state: GameState,
  events: EventSink,
  player: PlayerId,
): void {
  const p = state.players[player];
  if (!p || !p.viable) return;
  p.viable = false;
  p.hand = [];
  p.stock = {};
  for (const [, t] of sortedEntries(state.territories)) {
    if (t.owner === player) {
      t.owner = null;
      t.hungry = 0;
      t.militia = ctx.ruleset.match.neutral.militiaAfterTiedClaim;
    }
  }
  for (const [id, inst] of sortedEntries(state.installations))
    if (inst.owner === player) delete state.installations[id];
  for (const [id, unit] of sortedEntries(state.units))
    if (unit.owner === player) delete state.units[id];
  events.push({ type: 'PlayerEliminated', visibility: 'public', player, round: state.round });
}
