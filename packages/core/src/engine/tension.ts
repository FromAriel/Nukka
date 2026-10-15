/** Tension, blame and hostility bookkeeping (Tension and Diplomacy spec §2–4). */
import { clamp } from '../fixed.js';
import type { MatchContext } from './context.js';
import { tensionFloor } from './derived.js';
import { hostilityKey, type GameState, type PlayerId } from './state.js';
import type { EventSink } from './events.js';

/** Re-applies the floor and the cap: T = min(max, max(T, F)). */
export function settleTension(ctx: MatchContext, state: GameState): void {
  state.tension.floor = tensionFloor(ctx, state);
  if (state.tension.release === 'aftermath') {
    state.tension.value = ctx.ruleset.tension.max;
    return;
  }
  state.tension.value = clamp(state.tension.value, state.tension.floor, ctx.ruleset.tension.max);
}

/** Changes tension, logging who caused it and why. */
export function changeTension(
  ctx: MatchContext,
  state: GameState,
  events: EventSink,
  amount: number,
  source: PlayerId | null,
  reason: string,
): void {
  if (amount === 0) return;
  const before = state.tension.value;
  state.tension.value += amount;
  settleTension(ctx, state);
  const applied = state.tension.value - before;
  state.tension.log.push({ round: state.round, source, amount: applied, reason });
  events.push({
    type: 'TensionChanged',
    visibility: 'public',
    source,
    amount: applied,
    reason,
    value: state.tension.value,
  });
}

export function changeBlame(
  ctx: MatchContext,
  state: GameState,
  events: EventSink,
  player: PlayerId,
  amount: number,
  reason: string,
): void {
  const p = state.players[player];
  if (!p || amount === 0) return;
  p.blame = Math.max(0, p.blame + amount);
  if (amount > 0) {
    p.blameGainedThisRound = true;
    p.infamy += amount * ctx.ruleset.tension.infamy.perBlame;
  }
  events.push({
    type: 'BlameChanged',
    visibility: 'public',
    player,
    amount,
    reason,
    blame: p.blame,
  });
}

export function changeInfamy(state: GameState, player: PlayerId, amount: number): void {
  const p = state.players[player];
  if (p) p.infamy = Math.max(0, p.infamy + amount);
}

export function changeHostility(
  ctx: MatchContext,
  state: GameState,
  from: PlayerId,
  toward: PlayerId,
  amount: number,
): void {
  if (from === toward) return;
  const key = hostilityKey(from, toward);
  state.hostility[key] = clamp(
    (state.hostility[key] ?? 0) + amount,
    0,
    ctx.ruleset.tension.hostility.max,
  );
}

export function isPariah(ctx: MatchContext, state: GameState, player: PlayerId): boolean {
  return (state.players[player]?.blame ?? 0) >= ctx.ruleset.tension.blame.pariahThreshold;
}
