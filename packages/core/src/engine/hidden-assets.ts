/** Covert Program builds: hidden until revealed, then penalized (Covert spec §8). */
import { sortedEntries } from '../collections.js';
import { ceilDiv, mulPermille } from '../fixed.js';
import type { MatchContext } from './context.js';
import type { EventSink } from './events.js';
import { changeBlame, changeTension } from './tension.js';
import type { GameState, PlayerId } from './state.js';

export function hasHiddenAssets(state: GameState, player: PlayerId): boolean {
  const p = state.players[player];
  return (
    sortedEntries(state.installations).some(([, i]) => i.owner === player && i.hidden) ||
    sortedEntries(state.units).some(([, u]) => u.owner === player && u.hidden) ||
    sortedEntries(p?.hiddenStock ?? {}).some(([, n]) => n > 0)
  );
}

/** Reveals every hidden asset of a player, applying 1.5× the build spike and the reveal blame per asset. */
export function revealCovertPrograms(
  ctx: MatchContext,
  state: GameState,
  events: EventSink,
  player: PlayerId,
  how: string,
): void {
  const p = state.players[player];
  if (!p || !hasHiddenAssets(state, player)) return;
  const { revealSpikePermille, revealBlame } = ctx.ruleset.covert.covertProgram;
  const spikes = ctx.ruleset.tension.buildupSpikes;
  const revealed: string[] = [];
  let spike = 0;
  let builds = 0;
  for (const [, inst] of sortedEntries(state.installations)) {
    if (inst.owner === player && inst.hidden) {
      inst.hidden = false;
      spike += spikes[inst.kind] ?? 0;
      builds++;
      revealed.push(inst.kind);
    }
  }
  for (const [, unit] of sortedEntries(state.units)) {
    if (unit.owner === player && unit.hidden) {
      unit.hidden = false;
      spike += (spikes[unit.kind] ?? 0) * unit.count;
      builds += unit.count;
      revealed.push(unit.kind);
    }
  }
  for (const [kind, count] of sortedEntries(p.hiddenStock)) {
    if (count <= 0) continue;
    const batches = ceilDiv(count, ctx.ruleset.units.ammunition[kind]?.quantity ?? 1);
    spike += (spikes[kind] ?? 0) * batches;
    builds += batches;
    p.stock[kind] = (p.stock[kind] ?? 0) + count;
    revealed.push(kind);
  }
  p.hiddenStock = {};
  events.push({
    type: 'CovertProgramRevealed',
    visibility: 'public',
    player,
    assets: revealed,
    how,
  });
  changeTension(
    ctx,
    state,
    events,
    mulPermille(spike, revealSpikePermille),
    player,
    `${player}'s covert program revealed`,
  );
  changeBlame(ctx, state, events, player, revealBlame * builds, 'covert program revealed');
}
