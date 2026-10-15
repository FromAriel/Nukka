/**
 * The round state machine (Technical Architecture spec §7–8). Players and
 * bots interact only through `submit`; everything else runs automatically
 * until the next decision is needed.
 */
import { checkSeq, type CommandEnvelope } from '../commands.js';
import type { MatchContext } from './context.js';
import type { EventSink, GameEvent } from './events.js';
import { resolvePlanning, validatePlanning } from './planning.js';
import { scoreFor } from './score.js';
import {
  PASS_ORDERS,
  type GameState,
  type PendingDecision,
  type PlanningOrders,
  type PlayerId,
} from './state.js';
import { runUpkeep } from './upkeep.js';

export type Command = { type: 'SubmitPlanning'; orders: PlanningOrders };

export type SubmitResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; code: string; problems: string[] };

export function pendingDecisions(state: GameState): readonly PendingDecision[] {
  return state.decisions;
}

/** The safe default for a decision whose deadline passed (§7.1): never escalates. */
export function defaultCommand(decision: PendingDecision): Command {
  switch (decision.kind) {
    case 'planning':
      return { type: 'SubmitPlanning', orders: PASS_ORDERS };
  }
}

function openDecisions(state: GameState, kind: PendingDecision['kind']): void {
  state.decisions = state.playerIds
    .filter((id) => state.players[id]?.viable)
    .map((player) => ({ player, kind }));
}

/** Opens round 1's planning. Call once on a freshly created match. */
export function startMatch(state: GameState): GameState {
  const next = structuredClone(state);
  openDecisions(next, 'planning');
  return next;
}

export function submit(
  ctx: MatchContext,
  state: GameState,
  envelope: CommandEnvelope<Command>,
): SubmitResult {
  if (envelope.matchId !== state.meta.matchId)
    return { ok: false, code: 'wrong-match', problems: ['wrong match'] };
  const seq = checkSeq(state.lastSeq[envelope.playerId], envelope.seq);
  if (!seq.ok)
    return {
      ok: false,
      code: seq.code,
      problems: [`sequence ${envelope.seq} rejected (${seq.code})`],
    };
  const decision = state.decisions.find((d) => d.player === envelope.playerId);
  if (!decision)
    return { ok: false, code: 'not-waiting', problems: ['no decision is pending for you'] };

  const { cmd } = envelope;
  const problems = validate(ctx, state, envelope.playerId, decision, cmd);
  if (problems.length > 0) return { ok: false, code: 'invalid', problems };

  const next = structuredClone(state);
  const events: GameEvent[] = [];
  next.lastSeq[envelope.playerId] = envelope.seq;
  next.decisions = next.decisions.filter((d) => d !== decision && d.player !== envelope.playerId);
  apply(next, envelope.playerId, cmd);
  if (next.decisions.length === 0) runUntilDecision(ctx, next, events);
  return { ok: true, state: next, events };
}

function validate(
  ctx: MatchContext,
  state: GameState,
  player: PlayerId,
  decision: PendingDecision,
  cmd: Command,
): string[] {
  switch (cmd.type) {
    case 'SubmitPlanning':
      if (decision.kind !== 'planning') return [`expected a ${decision.kind} decision`];
      return validatePlanning(ctx, state, player, cmd.orders);
  }
}

function apply(state: GameState, player: PlayerId, cmd: Command): void {
  switch (cmd.type) {
    case 'SubmitPlanning':
      state.planningOrders[player] = structuredClone(cmd.orders);
      return;
  }
}

/** Runs automatic steps until someone must decide or the match ends. */
function runUntilDecision(ctx: MatchContext, state: GameState, events: EventSink): void {
  for (;;) {
    if (state.decisions.length > 0 || state.phase === 'ended') return;
    switch (state.phase) {
      case 'planning':
        resolvePlanning(ctx, state, events);
        state.phase = 'intelligence';
        break;
      case 'intelligence':
        // Covert operations resolve here (slice 4e).
        state.phase = 'events';
        break;
      case 'events':
        // Main actions and chains resolve here (slices 4d and 4f).
        state.phase = 'crisis';
        break;
      case 'crisis':
        // Crisis check, vote and final commitments (slice 4c).
        state.phase = 'combat';
        break;
      case 'combat':
        // The shared combat window (step 6).
        state.phase = 'aftermath';
        break;
      case 'aftermath':
        runAftermath(ctx, state, events);
        break;
      case 'upkeep':
        runUpkeep(ctx, state, events);
        state.phase = 'planning';
        openDecisions(state, 'planning');
        break;
    }
  }
}

function runAftermath(ctx: MatchContext, state: GameState, events: EventSink): void {
  // Discard down to the hand limit; the default discards the most recently drawn cards.
  const max = ctx.ruleset.match.hand.max;
  for (const id of state.playerIds) {
    const p = state.players[id]!;
    while (p.hand.length > max) state.deck.discard.push(p.hand.pop() as string);
    p.counterIntel = 0;
  }
  const viable = state.playerIds.filter((id) => state.players[id]?.viable);
  const finished = state.round >= ctx.ruleset.match.rounds;
  if (finished || viable.length <= 1) {
    endMatch(
      ctx,
      state,
      events,
      viable.length === 0 ? 'mutual-defeat' : finished ? 'rounds' : 'last-viable',
    );
    return;
  }
  state.round++;
  state.phase = 'upkeep';
}

function endMatch(
  ctx: MatchContext,
  state: GameState,
  events: EventSink,
  reason: NonNullable<GameState['result']>['reason'],
): void {
  const scores: Record<PlayerId, number> = {};
  for (const id of state.playerIds) scores[id] = scoreFor(ctx, state, id).total;
  const viable = state.playerIds.filter((id) => state.players[id]?.viable);
  const best = Math.max(...viable.map((id) => scores[id] ?? 0));
  const winners = reason === 'mutual-defeat' ? [] : viable.filter((id) => scores[id] === best);
  state.result = { reason, scores, winners };
  state.phase = 'ended';
  state.decisions = [];
  events.push({ type: 'MatchEnded', visibility: 'public', reason, scores, winners });
}
