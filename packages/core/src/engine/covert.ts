/**
 * Covert operations (Covert Operations spec). Operations are placed face down
 * during planning, go off 1–3 rounds later at the intelligence step in
 * shuffled order, and are credited to an unknown actor unless exposed.
 */
import { sortedEntries } from '../collections.js';
import type { CardDef } from '../data/cards.js';
import { cardDef, targetOwner, targetProblems } from './cards.js';
import type { MatchContext } from './context.js';
import { NO_ADJUSTMENTS, applyEffects } from './effects.js';
import type { EventSink } from './events.js';
import { rollInt, shuffleWith } from './random.js';
import { newId } from './setup.js';
import { changeBlame, changeHostility, changeTension } from './tension.js';
import type {
  CovertOperation,
  GameState,
  PlanningOrders,
  PlayerId,
  ShadowMarker,
} from './state.js';

/** Shadow slots: one, or two with an operational intelligence bureau. */
export function shadowSlots(ctx: MatchContext, state: GameState, player: PlayerId): number {
  const slots = ctx.ruleset.covert.shadowSlots;
  const bureau = sortedEntries(state.installations).some(
    ([, i]) =>
      i.owner === player &&
      i.kind === 'bureau' &&
      i.condition !== 'ruined' &&
      i.repairCompletesRound === null,
  );
  return bureau ? slots.withBureau : slots.base;
}

/** IP cost of a marker. */
export function markerCost(ctx: MatchContext, marker: ShadowMarker): number {
  if (marker.type !== 'operation') return 0;
  let cost = cardDef(ctx, marker.card).cost?.ip ?? 0;
  cost += marker.boost ?? 0;
  if (marker.fuse !== undefined) cost += ctx.ruleset.covert.fuse.preciseTimingCost;
  if (marker.insideAgent) cost += cardDef(ctx, 'inside-agent').cost?.ip ?? 0;
  return cost;
}

/** Cards from hand that planning orders use, so we can check the hand holds them all. */
export function cardsUsed(orders: PlanningOrders): string[] {
  const used: string[] = [];
  if (orders.main.type === 'card') used.push(orders.main.card);
  for (const marker of orders.shadow) {
    if (marker.type === 'operation') {
      used.push(marker.card);
      if (marker.insideAgent) used.push('inside-agent');
    } else if (marker.type === 'countermeasure') used.push(marker.card);
  }
  for (const order of orders.development) {
    if ('covert' in order && order.covert) used.push('covert-program');
  }
  return used;
}

/** IP spent by planning orders on covert activity (not counting counter-intelligence). */
export function covertIpCost(ctx: MatchContext, orders: PlanningOrders): number {
  let cost = orders.shadow.reduce((sum, m) => sum + markerCost(ctx, m), 0);
  const programs = orders.development.filter((o) => 'covert' in o && o.covert).length;
  cost += programs * (cardDef(ctx, 'covert-program').cost?.ip ?? 0);
  if (orders.accusation) cost += ctx.ruleset.covert.accusation.cost;
  return cost;
}

function treatyTargetProblems(state: GameState, player: PlayerId, target: string): string[] {
  const treaty = state.treaties.find((t) => t.id === target);
  if (!treaty) return [`unknown treaty "${target}"`];
  if (treaty.parties.includes(player))
    return ['Spoiler must target a treaty between other players'];
  return [];
}

export function shadowProblems(
  ctx: MatchContext,
  state: GameState,
  player: PlayerId,
  orders: PlanningOrders,
): string[] {
  const problems: string[] = [];
  const slots = shadowSlots(ctx, state, player);
  // Unfilled slots are padded with blanks by the engine, identically for everyone.
  if (orders.shadow.length > slots) problems.push(`shadow: you have ${slots} shadow slot(s)`);
  const { boost, fuse } = ctx.ruleset.covert;
  orders.shadow.forEach((marker, i) => {
    const at = `shadow[${i}]`;
    if (marker.type === 'blank') return;
    let card: CardDef;
    try {
      card = cardDef(ctx, marker.card);
    } catch {
      problems.push(`${at}: unknown card "${marker.card}"`);
      return;
    }
    if (marker.type === 'countermeasure') {
      if (!card.plays.includes('countermeasure'))
        problems.push(`${at}: ${card.name} is not a countermeasure`);
      return;
    }
    if (!card.plays.includes('operation')) {
      problems.push(`${at}: ${card.name} is not a covert operation`);
      return;
    }
    const targetIssues =
      card.target.type === 'treaty'
        ? treatyTargetProblems(state, player, marker.target)
        : targetProblems(ctx, state, player, card, marker.target);
    problems.push(...targetIssues.map((m) => `${at}: ${m}`));
    const b = marker.boost ?? 0;
    if (!Number.isSafeInteger(b) || b < 0 || b > boost.maxBonus)
      problems.push(`${at}: boost must be 0–${boost.maxBonus}`);
    if (
      marker.fuse !== undefined &&
      (marker.fuse < fuse.minRounds || marker.fuse > fuse.maxRounds)
    ) {
      problems.push(`${at}: fuse must be ${fuse.minRounds}–${fuse.maxRounds} rounds`);
    }
  });
  if (orders.accusation) {
    const { record, accused } = orders.accusation;
    const known = state.covert.history.find((h) => h.id === record);
    if (!known || !known.victims.includes(player) || known.outcome === 'fizzled')
      problems.push('accusation: not a covert effect against you');
    else if (known.round < state.round - ctx.ruleset.covert.accusation.lookbackRounds)
      problems.push('accusation: too long ago');
    if (accused === player || !state.players[accused])
      problems.push('accusation: accuse another player');
  }
  return problems;
}

/** Places markers at planning resolution: cards leave the hand, fuses are rolled. */
export function placeShadowMarkers(
  ctx: MatchContext,
  state: GameState,
  player: PlayerId,
  orders: PlanningOrders,
): void {
  const p = state.players[player]!;
  const take = (card: string) => {
    const i = p.hand.indexOf(card);
    if (i >= 0) p.hand.splice(i, 1);
  };
  for (const marker of orders.shadow) {
    if (marker.type === 'blank') continue;
    take(marker.card);
    if (marker.type === 'countermeasure') {
      const lasts =
        cardDef(ctx, marker.card).lastsRounds ?? ctx.ruleset.covert.countermeasureRounds;
      state.covert.countermeasures.push({
        id: newId(state, 'k'),
        owner: player,
        card: marker.card,
        untilRound: state.round + lasts - 1,
      });
      continue;
    }
    const card = cardDef(ctx, marker.card);
    const { fuse } = ctx.ruleset.covert;
    const rounds = marker.fuse ?? rollInt(state, 'fuses', fuse.minRounds, fuse.maxRounds);
    if (marker.insideAgent) {
      take('inside-agent');
      state.deck.covertDiscard.push('inside-agent');
    }
    const agentBonus = marker.insideAgent ? agentDifficultyBonus(ctx) : 0;
    state.covert.operations.push({
      id: newId(state, 'o'),
      owner: player,
      card: marker.card,
      target: marker.target,
      fireRound: state.round + rounds,
      difficulty:
        (card.difficulty ?? 0) + (marker.boost ?? 0) * ctx.ruleset.covert.boost.perIp + agentBonus,
      ignoresCountermeasures: marker.insideAgent === true,
    });
  }
  p.reserves.intelligence -= covertIpCost(ctx, orders);
}

function agentDifficultyBonus(ctx: MatchContext): number {
  const effect = cardDef(ctx, 'inside-agent').effects.find((e) => e.op === 'modify');
  return typeof effect?.['difficultyBonus'] === 'number' ? effect['difficultyBonus'] : 0;
}

function victimsOf(ctx: MatchContext, state: GameState, op: CovertOperation): PlayerId[] {
  const card = cardDef(ctx, op.card);
  if (card.target.type === 'treaty')
    return state.treaties.find((t) => t.id === op.target)?.parties ?? [];
  const owner = targetOwner(state, card, op.target);
  return owner === null ? [] : [owner];
}

function stillValid(ctx: MatchContext, state: GameState, op: CovertOperation): boolean {
  const card = cardDef(ctx, op.card);
  if (card.target.type === 'treaty')
    return treatyTargetProblems(state, op.owner, op.target).length === 0;
  return targetProblems(ctx, state, op.owner, card, op.target).length === 0;
}

/** The intelligence step: resolves operations whose fuse ran out, in seeded random order. */
export function runIntelligence(ctx: MatchContext, state: GameState, events: EventSink): void {
  const due = state.covert.operations.filter((op) => op.fireRound <= state.round);
  state.covert.operations = state.covert.operations.filter((op) => op.fireRound > state.round);
  state.covert.countermeasures = state.covert.countermeasures.filter(
    (c) => c.untilRound >= state.round,
  );
  for (const op of shuffleWith(state, 'intel-shuffle', due))
    resolveOperation(ctx, state, events, op);
}

function resolveOperation(
  ctx: MatchContext,
  state: GameState,
  events: EventSink,
  op: CovertOperation,
): void {
  const card = cardDef(ctx, op.card);
  state.deck.covertDiscard.push(op.card);
  const record = {
    id: newId(state, 'r'),
    round: state.round,
    owner: op.owner,
    victims: [] as PlayerId[],
    card: op.card,
  };
  if (!state.players[op.owner]?.viable || !stillValid(ctx, state, op)) {
    state.covert.history.push({ ...record, outcome: 'fizzled' });
    events.push({
      type: 'CovertFizzled',
      visibility: { players: [op.owner] },
      record: record.id,
      card: card.id,
      target: op.target,
    });
    return;
  }
  const victims = victimsOf(ctx, state, op);
  record.victims = victims;

  // A countermeasure catches it outright, unless an Inside Agent got past it.
  const trap = op.ignoresCountermeasures
    ? undefined
    : state.covert.countermeasures.find(
        (c) => victims.includes(c.owner) && c.untilRound >= state.round,
      );
  let outcome: 'success' | 'foiled' | 'exposed';
  if (trap) {
    state.covert.countermeasures = state.covert.countermeasures.filter((c) => c.id !== trap.id);
    state.deck.covertDiscard.push(trap.card);
    outcome = 'exposed';
  } else {
    const ci = Math.max(0, ...victims.map((v) => state.players[v]?.counterIntel ?? 0));
    outcome =
      ci >= op.difficulty + ctx.ruleset.covert.exposeMargin
        ? 'exposed'
        : ci >= op.difficulty
          ? 'foiled'
          : 'success';
  }
  state.covert.history.push({ ...record, outcome });

  if (outcome === 'success') {
    applyEffects(
      {
        ctx,
        state,
        events,
        bindings: {
          self: op.owner,
          target: op.target,
          targetOwner: victims[0] ?? null,
          signatories: victims,
        },
        answers: {},
        adjust: NO_ADJUSTMENTS,
        params: {},
        mode: 'root',
        cardName: card.name,
      },
      card.effects,
    );
    if (card.tensionWhen === 'on-success' && card.tension !== 0)
      changeTension(ctx, state, events, card.tension, null, `${card.name} (unknown actor)`);
  }
  if (outcome === 'exposed') {
    const exposure = ctx.ruleset.covert.exposure;
    changeTension(
      ctx,
      state,
      events,
      exposure.tension,
      op.owner,
      `${op.owner} exposed running ${card.name}`,
    );
    changeBlame(
      ctx,
      state,
      events,
      op.owner,
      exposure.blame + (card.blameWhen === 'on-exposure' ? card.blame : 0),
      `exposed: ${card.name}`,
    );
    for (const v of victims) changeHostility(ctx, state, v, op.owner, exposure.hostility);
  }

  // Everyone sees the public result, credited to an unknown actor unless exposed.
  events.push({
    type: 'CovertEffect',
    visibility: 'public',
    record: record.id,
    card: outcome === 'success' && card.id === 'reconnaissance' ? null : card.id,
    victims,
    outcome,
    actor: outcome === 'exposed' ? op.owner : null,
    target: op.target,
  });
  events.push({
    type: 'CovertReport',
    visibility: { players: [op.owner] },
    record: record.id,
    card: card.id,
    outcome,
    target: op.target,
  });
}

/** Resolves an accusation: right exposes the accused for that operation; wrong costs the accuser. */
export function resolveAccusation(
  ctx: MatchContext,
  state: GameState,
  events: EventSink,
  accuser: PlayerId,
  accused: PlayerId,
  recordId: string,
): void {
  const record = state.covert.history.find((h) => h.id === recordId);
  const rules = ctx.ruleset.covert;
  const correct =
    record !== undefined && record.owner === accused && record.victims.includes(accuser);
  events.push({
    type: 'Accusation',
    visibility: 'public',
    accuser,
    accused,
    record: recordId,
    correct,
  });
  if (correct) {
    changeTension(
      ctx,
      state,
      events,
      rules.exposure.tension,
      accused,
      `${accused} exposed by accusation`,
    );
    changeBlame(ctx, state, events, accused, rules.exposure.blame, 'exposed by accusation');
    changeHostility(ctx, state, accuser, accused, rules.exposure.hostility);
  } else {
    changeBlame(ctx, state, events, accuser, rules.accusation.wrongBlame, 'false accusation');
    changeHostility(ctx, state, accused, accuser, rules.accusation.wrongHostility);
  }
}
