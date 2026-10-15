import {
  PASS_ORDERS,
  defaultCommand,
  startMatch,
  submit,
  type CombatResolver,
  type Command,
  type GameEvent,
  type GameState,
  type MatchContext,
  type PendingDecision,
  type PlanningOrders,
} from '@nukka/core';
import { standardMatch } from './fixtures.js';

export type Responder = (d: PendingDecision, state: GameState) => Command | undefined;

/**
 * Plays one round: planning orders per player, then answers every later
 * decision with `respond` (or the safe default) until planning reopens.
 */
export function round(
  ctx: MatchContext,
  state: GameState,
  plans: Record<string, Partial<PlanningOrders>>,
  respond: Responder = () => undefined,
): { state: GameState; events: GameEvent[] } {
  let current = state;
  const events: GameEvent[] = [];
  const startRound = current.round;
  let guard = 0;
  while (
    current.phase !== 'ended' &&
    !(current.round > startRound && current.phase === 'planning')
  ) {
    if (++guard > 200) throw new Error('round did not finish');
    const d = current.decisions[0];
    if (!d) throw new Error(`stuck in ${current.phase}`);
    const cmd: Command =
      d.kind === 'planning'
        ? { type: 'SubmitPlanning', orders: { ...PASS_ORDERS, ...plans[d.player] } }
        : (respond(d, current) ?? defaultCommand(d));
    const r = submit(ctx, current, {
      matchId: current.meta.matchId,
      playerId: d.player,
      seq: (current.lastSeq[d.player] ?? 0) + 1,
      cmd,
    });
    if (!r.ok) throw new Error(`${d.player} ${d.kind}: ${r.problems.join('; ')}`);
    current = r.state;
    events.push(...r.events);
  }
  return { state: current, events };
}

export function match(
  hands: Record<string, string[]>,
  options: { scenario?: string; tension?: number; seed?: number; combat?: CombatResolver } = {},
) {
  const { ctx, state } = standardMatch({
    ...(options.scenario ? { scenario: options.scenario } : {}),
    ...(options.seed ? { seed: options.seed } : {}),
    ...(options.combat ? { combat: options.combat } : {}),
  });
  for (const [id, hand] of Object.entries(hands)) state.players[id]!.hand = [...hand];
  for (const id of state.playerIds) if (!hands[id]) state.players[id]!.hand = [];
  if (options.tension !== undefined) state.tension.value = options.tension;
  return { ctx, state: startMatch(state) };
}

export const play = (card: string, target?: string, params?: object): Partial<PlanningOrders> => ({
  main: { type: 'card', card, ...(target ? { target } : {}), ...(params ? { params } : {}) },
});
export const tensionFrom = (events: GameEvent[], reason: string) =>
  events
    .filter((e) => e.type === 'TensionChanged' && e['reason'] === reason)
    .reduce((s, e) => s + (e['amount'] as number), 0);
