/** Proposals, missions and treaties (Tension and Diplomacy spec §5). */
import type { MatchContext } from './context.js';
import { posturePoints } from './derived.js';
import type { EventSink } from './events.js';
import { drawCards, newId } from './setup.js';
import { changeBlame, changeHostility, changeInfamy, changeTension, isPariah } from './tension.js';
import {
  pairKey,
  type GameState,
  type MainAction,
  type PlayerId,
  type Proposal,
  type ProposalKind,
  type Treaty,
} from './state.js';

const TREATY_KINDS: ReadonlySet<ProposalKind> = new Set([
  'nonAggression',
  'defensive',
  'trade',
  'ceasefire',
  'armsControl',
  'settlement',
  'moratorium',
]);

export function isTreatyKind(kind: ProposalKind): boolean {
  return TREATY_KINDS.has(kind);
}

export function relation(state: GameState, a: PlayerId, b: PlayerId) {
  return state.relations[pairKey(a, b)] ?? 'peace';
}

export function treatiesBetween(
  state: GameState,
  a: PlayerId,
  b: PlayerId,
  kind?: string,
): Treaty[] {
  return state.treaties.filter(
    (t) =>
      t.parties.includes(a) && t.parties.includes(b) && (kind === undefined || t.kind === kind),
  );
}

export function inCooldown(state: GameState, a: PlayerId, b: PlayerId): boolean {
  const [x, y] = a < b ? [a, b] : [b, a];
  return state.cooldowns.some((c) => c.a === x && c.b === y && c.untilRound >= state.round);
}

function startCooldown(ctx: MatchContext, state: GameState, parties: readonly PlayerId[]): void {
  const until = state.round + ctx.ruleset.tension.treaties.resignCooldownRounds;
  for (let i = 0; i < parties.length; i++) {
    for (let j = i + 1; j < parties.length; j++) {
      const [a, b] =
        parties[i]! < parties[j]! ? [parties[i]!, parties[j]!] : [parties[j]!, parties[i]!];
      state.cooldowns = state.cooldowns.filter((c) => !(c.a === a && c.b === b));
      state.cooldowns.push({ a, b, untilRound: until });
    }
  }
}

export function proposalParties(
  state: GameState,
  player: PlayerId,
  action: Extract<MainAction, { type: 'proposal' }>,
): PlayerId[] {
  if (action.proposal === 'settlement' || action.proposal === 'moratorium') {
    return state.playerIds.filter((id) => id !== player && state.players[id]?.viable);
  }
  if (action.proposal === 'mediation') return [action.target ?? '', action.second ?? ''];
  return [action.target ?? ''];
}

export function proposalProblems(
  state: GameState,
  player: PlayerId,
  action: Extract<MainAction, { type: 'proposal' }>,
): string[] {
  const kind = action.proposal;
  const parties = proposalParties(state, player, action);
  for (const party of parties) {
    if (!state.players[party]?.viable)
      return [`proposal: ${party || 'target'} is not a player in the game`];
    if (party === player) return ['proposal: you can not propose to yourself'];
  }
  if (isTreatyKind(kind) && kind !== 'settlement' && kind !== 'moratorium') {
    const other = parties[0]!;
    if (inCooldown(state, player, other)) return [`proposal: re-signing cooldown with ${other}`];
    if (treatiesBetween(state, player, other, kind).length > 0)
      return [`proposal: you already have a ${kind} treaty`];
  }
  switch (kind) {
    case 'nonAggression':
      if (relation(state, player, parties[0]!) === 'war')
        return ['proposal: you are at war; propose a ceasefire'];
      break;
    case 'ceasefire':
      if (relation(state, player, parties[0]!) !== 'war')
        return ['proposal: a ceasefire needs a war'];
      break;
    case 'mediation':
      if (parties[0] === parties[1]) return ['proposal: mediation needs two different players'];
      if (relation(state, parties[0]!, parties[1]!) !== 'war')
        return ['proposal: those players are not at war'];
      break;
    case 'moratorium':
      if (state.tension.release !== 'aftermath')
        return ['proposal: a moratorium is only possible after nuclear use'];
      break;
  }
  return [];
}

export function signTreaty(
  ctx: MatchContext,
  state: GameState,
  events: EventSink,
  kind: string,
  parties: PlayerId[],
  mediatedBy: PlayerId | null = null,
  applySigningTension = true,
): Treaty {
  const rules = ctx.ruleset.tension.treaties.kinds[kind];
  const treaty: Treaty = {
    id: newId(state, 't'),
    kind,
    parties: [...parties].sort(),
    signedRound: state.round,
    untilRound: rules?.durationRounds ? state.round + rules.durationRounds : null,
    mediatedBy,
    baselinePosture: {},
    deadlineRound: null,
  };
  if (kind === 'armsControl') {
    for (const p of treaty.parties) treaty.baselinePosture[p] = posturePoints(ctx, state, p);
    treaty.deadlineRound = state.round + ctx.ruleset.tension.treaties.armsControl.deadlineRounds;
  }
  if (kind === 'ceasefire') {
    for (let i = 0; i < treaty.parties.length; i++) {
      for (let j = i + 1; j < treaty.parties.length; j++)
        state.relations[pairKey(treaty.parties[i]!, treaty.parties[j]!)] = 'hostile';
    }
  }
  state.treaties.push(treaty);
  events.push({
    type: 'TreatySigned',
    visibility: 'public',
    treaty: treaty.id,
    kind,
    parties: treaty.parties,
    mediatedBy,
  });
  if (applySigningTension && rules)
    changeTension(ctx, state, events, rules.signingTension, null, `${kind} signed`);
  return treaty;
}

/** Ends a treaty. A breach applies penalties to the breaker; the cooldown always applies. */
export function endTreaty(
  ctx: MatchContext,
  state: GameState,
  events: EventSink,
  treaty: Treaty,
  how: { breaker?: PlayerId; reason: string },
): void {
  state.treaties = state.treaties.filter((t) => t.id !== treaty.id);
  startCooldown(ctx, state, treaty.parties);
  events.push({
    type: 'TreatyEnded',
    visibility: 'public',
    treaty: treaty.id,
    kind: treaty.kind,
    parties: treaty.parties,
    reason: how.reason,
  });
  if (how.breaker) {
    const breach = ctx.ruleset.tension.treaties.breach;
    changeTension(
      ctx,
      state,
      events,
      breach.tension,
      how.breaker,
      `${how.breaker} broke a ${treaty.kind} treaty`,
    );
    let blame = breach.blame;
    if (treaty.mediatedBy) blame += ctx.ruleset.tension.treaties.mediatedBreachExtraBlame;
    changeBlame(ctx, state, events, how.breaker, blame, `broke a ${treaty.kind} treaty`);
    for (const other of treaty.parties) {
      if (other !== how.breaker) changeHostility(ctx, state, other, how.breaker, breach.hostility);
    }
  }
}

/** Hostile acts against a pact or ceasefire partner break those treaties. */
export function breachIfProtected(
  ctx: MatchContext,
  state: GameState,
  events: EventSink,
  attacker: PlayerId,
  victim: PlayerId,
): void {
  for (const treaty of treatiesBetween(state, attacker, victim)) {
    if (treaty.kind === 'nonAggression' || treaty.kind === 'ceasefire') {
      endTreaty(ctx, state, events, treaty, { breaker: attacker, reason: 'breach' });
    }
  }
}

/** Leaving a treaty with a pariah: no penalty, a small blame reduction, cooldown applies. */
export function leaveTreatyProblems(
  ctx: MatchContext,
  state: GameState,
  player: PlayerId,
  treatyId: string,
): string[] {
  const treaty = state.treaties.find((t) => t.id === treatyId);
  if (!treaty || !treaty.parties.includes(player))
    return [`leaveTreaties: you are not in treaty ${treatyId}`];
  if (!treaty.parties.some((p) => p !== player && isPariah(ctx, state, p)))
    return ['leaveTreaties: only treaties with a pariah'];
  return [];
}

export function leaveTreaty(
  ctx: MatchContext,
  state: GameState,
  events: EventSink,
  player: PlayerId,
  treatyId: string,
): void {
  const treaty = state.treaties.find((t) => t.id === treatyId);
  if (!treaty) return;
  endTreaty(ctx, state, events, treaty, { reason: `${player} left a treaty with a pariah` });
  changeBlame(
    ctx,
    state,
    events,
    player,
    ctx.ruleset.tension.blame.leavePariahTreatyBlame,
    'left a treaty with a pariah',
  );
}

/** Applies an accepted proposal. */
export function applyProposal(
  ctx: MatchContext,
  state: GameState,
  events: EventSink,
  initiator: PlayerId,
  proposal: Proposal,
): void {
  const missions = ctx.ruleset.tension.missions;
  switch (proposal.kind) {
    case 'peaceEnvoy': {
      const target = proposal.parties[0]!;
      changeTension(ctx, state, events, missions.peaceEnvoy.tension, initiator, 'peace envoy');
      changeHostility(ctx, state, initiator, target, missions.peaceEnvoy.hostility);
      changeHostility(ctx, state, target, initiator, missions.peaceEnvoy.hostility);
      return;
    }
    case 'mediation': {
      const m = missions.mediation;
      signTreaty(ctx, state, events, 'ceasefire', [...proposal.parties], initiator, false);
      changeTension(ctx, state, events, m.tension, initiator, `${initiator} mediated a ceasefire`);
      const p = state.players[initiator]!;
      p.peaceBrokerTokens += m.brokerTokens;
      drawCards(state, initiator, m.cards);
      changeBlame(ctx, state, events, initiator, m.blame, 'mediated a ceasefire');
      changeInfamy(state, initiator, m.infamy);
      return;
    }
    case 'openVerification': {
      const target = proposal.parties[0]!;
      state.reveals.push({
        subject: 'nuclearBreakdown',
        of: initiator,
        to: target,
        untilRound: state.round,
      });
      changeTension(
        ctx,
        state,
        events,
        missions.openVerification.tension,
        initiator,
        'open verification',
      );
      return;
    }
    default:
      signTreaty(ctx, state, events, proposal.kind, [initiator, ...proposal.parties]);
  }
}

/** Upkeep housekeeping: expiring treaties, arms-control deadlines, cooldowns and reveals. */
export function upkeepDiplomacy(ctx: MatchContext, state: GameState, events: EventSink): void {
  for (const treaty of [...state.treaties]) {
    if (treaty.untilRound !== null && treaty.untilRound < state.round) {
      state.treaties = state.treaties.filter((t) => t.id !== treaty.id);
      events.push({
        type: 'TreatyExpired',
        visibility: 'public',
        treaty: treaty.id,
        kind: treaty.kind,
        parties: treaty.parties,
      });
      continue;
    }
    if (
      treaty.kind === 'armsControl' &&
      treaty.deadlineRound !== null &&
      treaty.deadlineRound < state.round
    ) {
      const required = ctx.ruleset.tension.treaties.armsControl.postureReduction;
      const breaker = treaty.parties.find(
        (p) => posturePoints(ctx, state, p) > (treaty.baselinePosture[p] ?? 0) - required,
      );
      if (breaker && state.players[breaker]?.viable)
        endTreaty(ctx, state, events, treaty, { breaker, reason: 'missed arms-control deadline' });
      else treaty.deadlineRound = null;
    }
  }
  state.cooldowns = state.cooldowns.filter((c) => c.untilRound >= state.round);
  state.reveals = state.reveals.filter((r) => r.untilRound >= state.round);
}
