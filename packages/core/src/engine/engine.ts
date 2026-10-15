/**
 * The round state machine (Technical Architecture spec §7–8). Players and
 * bots interact only through `submit`; everything else runs automatically
 * until the next decision is needed.
 */
import { checkSeq, type CommandEnvelope } from '../commands.js';
import { cardDef, reactionLegal } from './cards.js';
import type { MatchContext } from './context.js';
import { runIntelligence } from './covert.js';
import type { CombatInput } from './combat-interface.js';
import { crisisCheck, resolveCrisisVote } from './crisis.js';
import {
  answerHonorCall,
  applyCombatResult,
  hasNuclearDelivery,
  nuclearPlanProblems,
} from './operations.js';
import { safeOption } from './effects.js';
import type { EventSink, GameEvent } from './events.js';
import { applyReaction, legalReactions, runEvents } from './events-phase.js';
import { resolvePlanning, validatePlanning } from './planning.js';
import { scoreFor } from './score.js';
import {
  type CrisisVote,
  type NuclearPlan,
  PASS_ORDERS,
  type GameState,
  type PendingDecision,
  type PlanningOrders,
  type PlayerId,
} from './state.js';
import { runUpkeep } from './upkeep.js';

export type Command =
  | { type: 'SubmitPlanning'; orders: PlanningOrders }
  | { type: 'CastCrisisVote'; vote: CrisisVote }
  | { type: 'React'; card: string | null }
  | { type: 'Choose'; option: string }
  | { type: 'AnswerProposal'; accept: boolean }
  | { type: 'AnswerHonorCall'; honor: boolean }
  | { type: 'CommitNuclear'; plans: NuclearPlan[] };

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
    case 'crisis-vote':
      return { type: 'CastCrisisVote', vote: 'hold' };
    case 'reaction':
      return { type: 'React', card: null };
    case 'choice':
      return { type: 'Choose', option: safeOption((decision.options ?? []).map((id) => ({ id }))) };
    case 'proposal':
      return { type: 'AnswerProposal', accept: false };
    case 'honor':
      return { type: 'AnswerHonorCall', honor: false };
    case 'commit':
      return { type: 'CommitNuclear', plans: [] };
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
  if (envelope.matchId !== state.meta.matchId) {
    return { ok: false, code: 'wrong-match', problems: ['wrong match'] };
  }
  const seq = checkSeq(state.lastSeq[envelope.playerId], envelope.seq);
  if (!seq.ok) {
    return {
      ok: false,
      code: seq.code,
      problems: [`sequence ${envelope.seq} rejected (${seq.code})`],
    };
  }
  const decision = state.decisions.find((d) => d.player === envelope.playerId);
  if (!decision) {
    return { ok: false, code: 'not-waiting', problems: ['no decision is pending for you'] };
  }

  const { cmd } = envelope;
  const problems = validate(ctx, state, envelope.playerId, decision, cmd);
  if (problems.length > 0) return { ok: false, code: 'invalid', problems };

  const next = structuredClone(state);
  const events: GameEvent[] = [];
  next.lastSeq[envelope.playerId] = envelope.seq;
  next.decisions = next.decisions.filter((d) => d.player !== envelope.playerId);
  apply(ctx, next, events, envelope.playerId, cmd);
  if (next.decisions.length === 0) runUntilDecision(ctx, next, events);
  return { ok: true, state: next, events };
}

function expected(decision: PendingDecision): string[] {
  return [`expected a ${decision.kind} decision`];
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
      if (decision.kind !== 'planning') return expected(decision);
      return validatePlanning(ctx, state, player, cmd.orders);
    case 'CastCrisisVote':
      if (decision.kind !== 'crisis-vote') return expected(decision);
      return cmd.vote === 'authorize' || cmd.vote === 'hold'
        ? []
        : ['vote must be authorize or hold'];
    case 'React': {
      if (decision.kind !== 'reaction' || !decision.slot || !state.chain) return expected(decision);
      if (cmd.card === null) return [];
      if (legalReactions(ctx, state, state.chain, player, decision.slot).includes(cmd.card))
        return [];
      const root = state.chain.links[0];
      const known = ctx.deck.cards.some((c) => c.id === cmd.card);
      const legalIfAffordable =
        known && root && state.players[player]?.hand.includes(cmd.card)
          ? reactionLegal(ctx, state, player, cardDef(ctx, cmd.card), decision.slot, root, 1)
          : false;
      return [
        `${cmd.card}: ${legalIfAffordable ? 'no reaction points left' : 'not a legal reaction here'}`,
      ];
    }
    case 'Choose':
      if (decision.kind !== 'choice') return expected(decision);
      return decision.options?.includes(cmd.option)
        ? []
        : [`option must be one of ${(decision.options ?? []).join(', ')}`];
    case 'AnswerProposal':
      return decision.kind === 'proposal' ? [] : expected(decision);
    case 'AnswerHonorCall':
      return decision.kind === 'honor' ? [] : expected(decision);
    case 'CommitNuclear':
      if (decision.kind !== 'commit') return expected(decision);
      return nuclearPlanProblems(ctx, state, player, cmd.plans);
  }
}

function apply(
  ctx: MatchContext,
  state: GameState,
  events: EventSink,
  player: PlayerId,
  cmd: Command,
): void {
  switch (cmd.type) {
    case 'SubmitPlanning':
      state.planningOrders[player] = structuredClone(cmd.orders);
      return;
    case 'CastCrisisVote':
      state.crisisVotes[player] = cmd.vote;
      return;
    case 'React':
      if (cmd.card !== null) {
        events.push({
          type: 'CardPlayed',
          visibility: 'public',
          player,
          card: cmd.card,
          slot: state.chain?.remaining[0],
        });
      }
      applyReaction(state, player, cmd.card);
      return;
    case 'Choose':
      if (state.chain) state.chain.answers[player] = cmd.option;
      return;
    case 'AnswerProposal':
      if (state.chain) state.chain.answers[player] = cmd.accept ? 'accept' : 'decline';
      return;
    case 'AnswerHonorCall':
      answerHonorCall(ctx, state, events, player, cmd.honor);
      return;
    case 'CommitNuclear':
      state.nuclearPlans[player] = cmd.plans.map((plan, i) => ({
        ...structuredClone(plan),
        id: `${player}-n${state.round}-${i}`,
      }));
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
        runIntelligence(ctx, state, events);
        state.phase = 'events';
        break;
      case 'events':
        if (runEvents(ctx, state, events)) state.phase = 'crisis';
        break;
      case 'crisis':
        if (runCrisis(ctx, state, events)) state.phase = 'combat';
        break;
      case 'combat':
        runCombat(ctx, state, events);
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

/** Returns true when the crisis step is finished; false while waiting for votes. */
function runCrisis(ctx: MatchContext, state: GameState, events: EventSink): boolean {
  if (state.crisisStage === 'vote') {
    const check = crisisCheck(ctx, state);
    if (check === 'vote') {
      const voted = state.playerIds
        .filter((id) => state.players[id]?.viable)
        .every((id) => state.crisisVotes[id] !== undefined);
      if (!voted) {
        openDecisions(state, 'crisis-vote');
        events.push({
          type: 'CrisisVoteCalled',
          visibility: 'public',
          tension: state.tension.value,
        });
        return false;
      }
      resolveCrisisVote(ctx, state, events);
    } else if (check !== 'aftermath') {
      state.tension.release = check === 'open' ? 'open' : 'locked';
      events.push({
        type: 'ReleaseDecided',
        visibility: 'public',
        release: state.tension.release,
        authorizers: [],
      });
    }
    state.crisisStage = 'honor';
  }
  if (state.crisisStage === 'honor') {
    state.crisisStage = 'commit';
    const allies = [...new Set(state.honorCalls.map((c) => c.ally))].sort();
    if (allies.length > 0) {
      state.decisions = allies.map((player) => ({ player, kind: 'honor' as const }));
      return false;
    }
  }
  if (state.crisisStage === 'commit') {
    state.crisisStage = 'done';
    const releaseOpen = state.tension.release === 'open' || state.tension.release === 'aftermath';
    const committers = releaseOpen
      ? state.playerIds.filter((id) => state.players[id]?.viable && hasNuclearDelivery(state, id))
      : [];
    if (committers.length > 0) {
      state.decisions = committers.map((player) => ({ player, kind: 'commit' as const }));
      return false;
    }
  }
  return true;
}

/** The shared combat window: one resolver call for every operation and committed plan. */
function runCombat(ctx: MatchContext, state: GameState, events: EventSink): void {
  const planCount = state.playerIds.reduce(
    (sum, id) => sum + (state.nuclearPlans[id]?.length ?? 0),
    0,
  );
  if (state.operations.length > 0 || planCount > 0) {
    if (!ctx.combat) throw new Error('combat is needed but no combat resolver was supplied');
    const input: CombatInput = {
      round: state.round,
      kind: planCount > 0 ? 'nuclear' : 'conventional',
      operations: structuredClone(state.operations),
      plans: structuredClone(state.nuclearPlans),
      policies: Object.fromEntries(
        state.playerIds.map((id) => [id, state.defensePolicies[id] ?? 'balanced']),
      ),
    };
    events.push({
      type: 'CombatStarted',
      visibility: 'public',
      kind: input.kind,
      operations: input.operations.length,
    });
    applyCombatResult(ctx, state, events, ctx.combat(ctx, state, input));
  }
  state.operations = [];
  state.nuclearPlans = {};
  state.honorCalls = [];
  state.crisisStage = 'vote';
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
  const settled = state.treaties.some((t) => t.kind === 'settlement');
  if (finished || settled || viable.length <= 1) {
    const reason =
      viable.length === 0
        ? 'mutual-defeat'
        : settled
          ? 'settlement'
          : finished
            ? 'rounds'
            : 'last-viable';
    endMatch(ctx, state, events, reason);
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
